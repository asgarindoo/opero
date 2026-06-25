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

// Cached cross-request (30s TTL) for membership/org checks
const _getOrgWithMemberBySlug = unstable_cache(
  async (userId: string, slug: string) =>
    prisma.organization.findUnique({
      where: { slug },
      select: {
        id: true,
        name: true,
        slug: true,
        logo: true,
        status: true,
        members: {
          where: { userId },
          select: { role: true, status: true },
        },
      },
    }),
  ["org-with-member-by-slug"],
  { revalidate: 30 }
);

const _getOrgWithMemberById = unstable_cache(
  async (userId: string, organizationId: string) =>
    prisma.organization.findUnique({
      where: { id: organizationId },
      select: {
        id: true,
        name: true,
        slug: true,
        logo: true,
        status: true,
        members: {
          where: { userId },
          select: { role: true, status: true },
        },
      },
    }),
  ["org-with-member-by-id"],
  { revalidate: 30 }
);

export const getCurrentTenant = cache(async function getCurrentTenant(): Promise<CurrentTenant | null> {
  const session = await getSession();
  if (!session?.session?.activeOrganizationId) return null;

  const org = await _getOrgWithMemberById(
    session.user.id,
    session.session.activeOrganizationId
  );

  const membership = org?.members?.[0];
  if (!org || org.status !== "active" || !membership || membership.status !== "active") return null;

  return { id: org.id, name: org.name, slug: org.slug, logo: org.logo, status: org.status };
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

export async function requireTenantAccess(
  slug: string
): Promise<TenantMembership> {
  const user = await requireAuth();

  const org = await prisma.organization.findUnique({
    where: { slug },
    select: {
      id: true, name: true, slug: true, logo: true, status: true,
      members: {
        where: { userId: user.id },
        select: { role: true, status: true }
      }
    },
  });

  if (!org) {
    throw new Response(JSON.stringify({ error: "Tenant not found" }), {
      status: 404,
      headers: { "Content-Type": "application/json" },
    });
  }

  if (org.status !== "active") {
    throw new Response(JSON.stringify({ error: "Tenant inactive" }), {
      status: 423,
      headers: { "Content-Type": "application/json" },
    });
  }

  const membership = org.members[0];
  if (!membership || membership.status !== "active") {
    throw new Response(JSON.stringify({ error: "Access denied" }), {
      status: 403,
      headers: { "Content-Type": "application/json" },
    });
  }

  const tenant = { id: org.id, name: org.name, slug: org.slug, logo: org.logo, status: org.status };
  return { tenant, user, role: membership.role as OrgRole };
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

// Resolve tenant from proxy header
export const resolveTenantFromRequest = cache(async function resolveTenantFromRequest(): Promise<CurrentTenant | null> {
  const hdrs = await headers();
  const slugFromHeader = hdrs.get("x-tenant-slug");

  if (slugFromHeader) {
    const { context } = await resolveTenantContext();
    if (context?.tenant.slug === slugFromHeader) {
      return context.tenant;
    }

    const org = await prisma.organization.findUnique({
      where: { slug: slugFromHeader },
      select: { id: true, name: true, slug: true, logo: true, status: true },
    });
    return org ?? null;
  }

  return getCurrentTenant();
});

export const resolveTenantContext = cache(async function resolveTenantContext(): Promise<TenantContextResolution> {
  const session = await getSession();
  if (!session?.user) return failedTenantContext(401, "Unauthorized");

  const hdrs = await headers();
  const headerTenantSlug = hdrs.get("x-tenant-slug");

  if (headerTenantSlug) {
    const org = await _getOrgWithMemberBySlug(session.user.id, headerTenantSlug);

    if (!org) {
      return failedTenantContext(404, "Tenant not found", headerTenantSlug);
    }

    if (org.status !== "active") {
      return failedTenantContext(423, "Tenant inactive", headerTenantSlug);
    }

    const membership = org.members[0];
    if (!membership || membership.status !== "active") {
      return failedTenantContext(403, "Access denied", headerTenantSlug);
    }

    const tenant = { id: org.id, name: org.name, slug: org.slug, logo: org.logo, status: org.status };
    return {
      context: createTenantContext(session, tenant, membership.role),
      failure: null,
    };
  }

  if (!session.session?.activeOrganizationId) {
    return failedTenantContext(401, "Unauthorized");
  }

  const org = await _getOrgWithMemberById(
    session.user.id,
    session.session.activeOrganizationId
  );

  if (!org) {
    return failedTenantContext(404, "Tenant not found");
  }

  if (org.status !== "active") {
    return failedTenantContext(423, "Tenant inactive", org.slug);
  }

  const membership = org.members[0];
  if (!membership || membership.status !== "active") {
    return failedTenantContext(403, "Access denied", org.slug);
  }

  const tenant = { id: org.id, name: org.name, slug: org.slug, logo: org.logo, status: org.status };
  return {
    context: createTenantContext(session, tenant, membership.role),
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
