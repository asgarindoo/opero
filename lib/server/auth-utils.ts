
import { headers } from "next/headers";
import { cache } from "react";
import { unstable_cache } from "next/cache";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { normalizeUserAvatarImage } from "@/lib/server/supabase-storage";
import { getUserDisplayName } from "@/lib/user-identity";


export type OrgRole = "owner" | "admin" | "member";

export interface CurrentUser {
  id: string;
  name: string;
  email: string;
  image: string | null;
}

export interface CurrentTenant {
  id: string;
  name: string;
  slug: string;
  logo: string | null;
  status: string;
}

export interface TenantMembership {
  tenant: CurrentTenant;
  user: CurrentUser;
  role: OrgRole;
}

export interface TenantContext extends TenantMembership {
  tenantId: string;
  tenantSlug: string;
  userId: string;
}

export interface TenantContextFailure {
  status: 401 | 403 | 404 | 423;
  error: string;
  tenantSlug?: string | null;
}

export interface TenantContextResolution {
  context: TenantContext | null;
  failure: TenantContextFailure | null;
}

// Cache per request biar tidak double query
export const getSession = cache(async function getSession() {
  try {
    const hdrs = await headers();
    const session = await auth.api.getSession({ headers: hdrs });
    return session;
  } catch {
    return null;
  }
});

export const getCurrentUser = cache(async function getCurrentUser(): Promise<CurrentUser | null> {
  const session = await getSession();
  if (!session?.user) return null;

  return userFromSession(session);
});

type TenantOrganization = Pick<CurrentTenant, "id" | "name" | "slug" | "logo" | "status">;
type CurrentSession = NonNullable<Awaited<ReturnType<typeof getSession>>>;

function userFromSession(session: CurrentSession): CurrentUser {
  return {
    id: session.user.id,
    name: getUserDisplayName(session.user),
    email: session.user.email,
    image: normalizeUserAvatarImage(session.user.id, session.user.image ?? null),
  };
}

function createTenantContext(session: CurrentSession, tenant: TenantOrganization, role: string): TenantContext {
  return {
    tenant,
    user: userFromSession(session),
    role: role as OrgRole,
    tenantId: tenant.id,
    tenantSlug: tenant.slug,
    userId: session.user.id,
  };
}

function failedTenantContext(
  status: TenantContextFailure["status"],
  error: string,
  tenantSlug?: string | null
): TenantContextResolution {
  return {
    context: null,
    failure: { status, error, tenantSlug },
  };
}

// ─── Cached DB queries ───────────────────────────────────────────────────────
// unstable_cache menyimpan hasil cross-request (shared across Vercel functions).
// TTL 30 detik — acceptable staleness untuk membership/org check.

const _getMemberBySlug = unstable_cache(
  async (userId: string, slug: string) =>
    prisma.member.findFirst({
      where: { userId, organization: { slug } },
      select: {
        role: true,
        status: true,
        organization: { select: { id: true, name: true, slug: true, logo: true, status: true } },
      },
    }),
  ["member-by-slug"],
  { revalidate: 30 }
);

const _getMemberByOrgId = unstable_cache(
  async (userId: string, organizationId: string) =>
    prisma.member.findUnique({
      where: { organizationId_userId: { organizationId, userId } },
      select: {
        role: true,
        status: true,
        organization: { select: { id: true, name: true, slug: true, logo: true, status: true } },
      },
    }),
  ["member-by-org-id"],
  { revalidate: 30 }
);

// ─────────────────────────────────────────────────────────────────────────────


export const getCurrentTenant = cache(async function getCurrentTenant(): Promise<CurrentTenant | null> {
  const session = await getSession();
  if (!session?.session?.activeOrganizationId) return null;

  // Cached: org + membership dalam 1 query, disimpan 30 detik cross-request
  const membership = await _getMemberByOrgId(
    session.user.id,
    session.session.activeOrganizationId
  );

  if (!membership?.organization || membership.status !== "active") return null;
  return membership.organization;
});


export async function requireAuth(): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user) {
    throw new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }
  return user;
}

// Cek role + membership tenant — 1 query dengan include organization
export async function requireTenantAccess(
  slug: string
): Promise<TenantMembership> {
  const user = await requireAuth();

  // Satu query: ambil membership + org sekaligus
  const membership = await prisma.member.findFirst({
    where: {
      userId: user.id,
      organization: { slug },
    },
    select: {
      role: true,
      status: true,
      organization: { select: { id: true, name: true, slug: true, logo: true, status: true } },
    },
  });

  if (!membership?.organization) {
    throw new Response(JSON.stringify({ error: "Tenant not found" }), {
      status: 404,
      headers: { "Content-Type": "application/json" },
    });
  }

  if (membership.organization.status !== "active") {
    throw new Response(JSON.stringify({ error: "Tenant inactive" }), {
      status: 423,
      headers: { "Content-Type": "application/json" },
    });
  }

  if (membership.status !== "active") {
    throw new Response(JSON.stringify({ error: "Access denied" }), {
      status: 403,
      headers: { "Content-Type": "application/json" },
    });
  }

  return { tenant: membership.organization, user, role: membership.role as OrgRole };
}

export async function requireRole(
  allowedRoles: OrgRole[]
): Promise<TenantContext> {
  const context = await requireTenantMember();

  if (!allowedRoles.includes(context.role)) {
    throw new Response(
      JSON.stringify({ error: "Insufficient permissions" }),
      { status: 403, headers: { "Content-Type": "application/json" } }
    );
  }

  return context;
}

// Ambil tenant dari header x-tenant-slug yang diset proxy.
// Prioritas: gunakan data dari resolveTenantContext (sudah cached) terlebih dahulu
// untuk menghindari DB query duplikat.
export const resolveTenantFromRequest = cache(async function resolveTenantFromRequest(): Promise<CurrentTenant | null> {
  const hdrs = await headers();
  const slugFromHeader = hdrs.get("x-tenant-slug");

  if (slugFromHeader) {
    // Coba pakai hasil cached dari resolveTenantContext dulu
    const { context } = await resolveTenantContext();
    if (context?.tenant.slug === slugFromHeader) {
      return context.tenant;
    }

    // Fallback ke DB jika slug tidak match (jarang terjadi)
    const org = await prisma.organization.findUnique({
      where: { slug: slugFromHeader },
      select: { id: true, name: true, slug: true, logo: true, status: true },
    });
    return org ?? null;
  }

  // Fallback: use active org from session
  return getCurrentTenant();
});


// Validasi session + tenant + membership sekaligus
export const resolveTenantContext = cache(async function resolveTenantContext(): Promise<TenantContextResolution> {
  const session = await getSession();
  if (!session?.user) return failedTenantContext(401, "Unauthorized");

  const hdrs = await headers();
  const headerTenantSlug = hdrs.get("x-tenant-slug");

  if (headerTenantSlug) {
    // Cached: membership + org dalam 1 query, TTL 30 detik
    const membership = await _getMemberBySlug(session.user.id, headerTenantSlug);

    if (!membership?.organization) {
      return failedTenantContext(404, "Tenant not found", headerTenantSlug);
    }

    if (membership.organization.status !== "active") {
      return failedTenantContext(423, "Tenant inactive", headerTenantSlug);
    }

    if (membership.status !== "active") {
      return failedTenantContext(403, "Access denied", headerTenantSlug);
    }

    return {
      context: createTenantContext(session, membership.organization, membership.role),
      failure: null,
    };
  }

  if (!session.session?.activeOrganizationId) {
    return failedTenantContext(401, "Unauthorized");
  }

  // Cached: membership + org via orgId, TTL 30 detik
  const membership = await _getMemberByOrgId(
    session.user.id,
    session.session.activeOrganizationId
  );

  if (!membership?.organization) {
    return failedTenantContext(403, "Access denied");
  }

  if (membership.organization.status !== "active") {
    return failedTenantContext(423, "Tenant inactive", membership.organization.slug);
  }

  if (membership.status !== "active") {
    return failedTenantContext(403, "Access denied", membership.organization.slug);
  }

  return {
    context: createTenantContext(session, membership.organization, membership.role),
    failure: null,
  };
});


export const getTenantContext = cache(async function getTenantContext(): Promise<TenantContext | null> {
  const result = await resolveTenantContext();
  return result.context;
});

export async function requireTenant(): Promise<TenantContext> {
  const result = await resolveTenantContext();
  if (!result.context) {
    const failure = result.failure ?? { status: 401, error: "Unauthorized" };
    throw new Response(JSON.stringify({ error: failure.error }), {
      status: failure.status,
      headers: { "Content-Type": "application/json" },
    });
  }
  return result.context;
}

export async function requireTenantMember(): Promise<TenantContext> {
  return requireTenant();
}
