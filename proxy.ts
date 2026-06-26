import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import {
  buildRootUrl,
  buildTenantUrl,
  extractTenantSlugFromHost,
  getRootUrl,
  splitHostPort,
} from "@/lib/routing";

const SESSION_DATA_COOKIE = "better-auth.session_data";
const SESSION_TOKEN_COOKIES = new Set([
  "better-auth.session_token",
  "__Secure-better-auth.session_token",
  "better-auth-session_token",
  "__Secure-better-auth-session_token",
]);
const SESSION_DATA_COOKIE_CLEAR_LIMIT = 32;

const AUTH_ROUTES = new Set(["/login", "/register", "/forgot-password"]);

const ROOT_ONLY_ROUTES = [
  "/login",
  "/register",
  "/forgot-password",
  "/logout",
  "/onboarding",
  "/join",
  "/create-tenant",
  "/tenants",
  "/unauthorized",
  "/tenant-not-found",
  "/tenant-inactive",
];

const ROOT_TENANT_API_ROUTES = new Set([
  "/api/tenant",
  "/api/tenant/create-eligibility",
  "/api/tenant/join",
]);

const SHARED_API_ROUTES = new Set(["/api/profile"]);

const SHARED_API_ROUTE_PREFIXES = [
  "/api/profile/",
  "/api/tenant/logo/",
];

const TENANT_SHORTPATHS = new Set([
  "/activity",
  "/assets",
  "/campaigns",
  "/chat",
  "/contacts",
  "/content-planner",
  "/documents",
  "/finance",
  "/flows",
  "/goals",
  "/invoices",
  "/members",
  "/products",
  "/profile",
  "/sales",
  "/settings",
  "/social-channels",
  "/tasks",
]);

const STATIC_ASSET_PATTERN =
  /\.(?:avif|css|gif|ico|jpeg|jpg|js|json|map|mp3|mp4|otf|pdf|png|svg|ttf|txt|webmanifest|webp|woff|woff2)$/i;

function getHost(request: NextRequest): string {
  return request.headers.get("host") ?? request.nextUrl.host;
}

function isDevelopment() {
  return process.env.NODE_ENV !== "production";
}

function getRootParts() {
  const root = new URL(getRootUrl());
  const rootDomain = process.env.NEXT_PUBLIC_ROOT_DOMAIN || root.hostname;
  return { root, rootDomain };
}

function isStaticOrInternal(pathname: string) {
  return (
    pathname.startsWith("/_next") ||
    pathname.startsWith("/api/auth") ||
    pathname === "/favicon.ico" ||
    pathname.startsWith("/public") ||
    STATIC_ASSET_PATTERN.test(pathname)
  );
}

function isRootOnlyRoute(pathname: string) {
  return ROOT_ONLY_ROUTES.some((route) => pathname === route || pathname.startsWith(`${route}/`));
}

function isRootTenantApiRoute(pathname: string) {
  return ROOT_TENANT_API_ROUTES.has(pathname);
}

function isSharedApiRoute(pathname: string) {
  return SHARED_API_ROUTES.has(pathname) || SHARED_API_ROUTE_PREFIXES.some((route) => pathname.startsWith(route));
}

function isApiRoute(pathname: string) {
  return pathname.startsWith("/api/");
}

function isTenantRoute(pathname: string) {
  return (
    pathname === "/" ||
    pathname.startsWith("/dashboard") ||
    pathname.startsWith("/api/tenant") ||
    pathname.startsWith("/api/profile") ||
    TENANT_SHORTPATHS.has(pathname) ||
    Array.from(TENANT_SHORTPATHS).some((route) => pathname.startsWith(`${route}/`))
  );
}

function normalizeTenantPath(pathname: string) {
  if (pathname === "/") return "/dashboard";
  if (
    pathname.startsWith("/dashboard") ||
    pathname.startsWith("/api/tenant") ||
    pathname.startsWith("/api/profile")
  ) {
    return pathname;
  }

  const shortPath = Array.from(TENANT_SHORTPATHS).find(
    (route) => pathname === route || pathname.startsWith(`${route}/`)
  );
  return shortPath ? `/dashboard${pathname}` : pathname;
}

function isSessionDataCookieName(name: string) {
  return (
    name === SESSION_DATA_COOKIE ||
    name.startsWith(`${SESSION_DATA_COOKIE}.`) ||
    name === `__Secure-${SESSION_DATA_COOKIE}` ||
    name.startsWith(`__Secure-${SESSION_DATA_COOKIE}.`)
  );
}

function hasSessionTokenCookie(request: NextRequest) {
  return request.cookies.getAll().some((cookie) => SESSION_TOKEN_COOKIES.has(cookie.name));
}

function stripSessionDataCookies(cookieHeader: string | null) {
  if (!cookieHeader) return null;

  const cookies = cookieHeader
    .split(";")
    .map((cookie) => cookie.trim())
    .filter(Boolean)
    .filter((cookie) => {
      const [name] = cookie.split("=");
      return name ? !isSessionDataCookieName(name.trim()) : false;
    });

  return cookies.length > 0 ? cookies.join("; ") : null;
}

function sessionDataCookieSortKey(name: string) {
  const normalized = name.startsWith("__Secure-") ? name.slice("__Secure-".length) : name;
  if (normalized === SESSION_DATA_COOKIE) return -1;
  const index = Number(normalized.slice(`${SESSION_DATA_COOKIE}.`.length));
  return Number.isFinite(index) ? index : Number.MAX_SAFE_INTEGER;
}

function sanitizeHeaders(headers: Headers): Headers {
  const sanitized = new Headers(headers);
  sanitized.delete("x-tenant-id");
  sanitized.delete("x-tenant-slug");
  sanitized.delete("x-user-id");
  sanitized.delete("x-user-role");

  return sanitized;
}

function cleanupSessionDataCookies(request: NextRequest, response: NextResponse) {
  const cookieNames = Array.from(
    new Set(
      request.cookies
        .getAll()
        .map((cookie) => cookie.name)
        .filter(isSessionDataCookieName)
    )
  )
    .sort((a, b) => sessionDataCookieSortKey(a) - sessionDataCookieSortKey(b) || a.localeCompare(b))
    .slice(0, SESSION_DATA_COOKIE_CLEAR_LIMIT);

  for (const name of cookieNames) {
    response.cookies.set(name, "", {
      path: "/",
      httpOnly: true,
      sameSite: "lax",
      maxAge: 0,
    });
  }

  return response;
}

function passThrough(request: NextRequest) {
  return cleanupSessionDataCookies(
    request,
    NextResponse.next({ request: { headers: sanitizeHeaders(request.headers) } })
  );
}

async function getSession(request: NextRequest) {
  const { auth } = await import("@/lib/auth");
  return auth.api.getSession({ headers: sanitizeHeaders(request.headers) }).catch(() => null);
}

function buildCurrentUrl(request: NextRequest) {
  const { root } = getRootParts();
  const url = new URL(`${root.protocol}//${getHost(request)}`);
  url.pathname = request.nextUrl.pathname;
  url.search = request.nextUrl.search;
  return url;
}

function isSafeCallbackUrl(value: string | null) {
  if (!value) return false;

  try {
    const url = new URL(value);
    const { root, rootDomain } = getRootParts();
    return (
      url.protocol === root.protocol &&
      (url.hostname === root.hostname ||
        url.hostname === rootDomain ||
        url.hostname.endsWith(`.${rootDomain}`))
    );
  } catch {
    return false;
  }
}

function buildLoginRedirect(request: NextRequest) {
  const loginUrl = buildRootUrl("/login");
  loginUrl.searchParams.set("callbackUrl", buildCurrentUrl(request).toString());
  return loginUrl;
}

function redirect(request: NextRequest, target: URL) {
  const response = NextResponse.redirect(target);
  debugTenantProxy(request, { redirectTarget: target.toString() });
  return cleanupSessionDataCookies(request, response);
}

function rewriteWithTenantHeaders(request: NextRequest, tenantSlug: string) {
  const requestHeaders = sanitizeHeaders(request.headers);
  requestHeaders.set("x-tenant-slug", tenantSlug);

  const normalizedPath = normalizeTenantPath(request.nextUrl.pathname);
  if (normalizedPath !== request.nextUrl.pathname) {
    const rewriteUrl = request.nextUrl.clone();
    rewriteUrl.pathname = normalizedPath;
    return cleanupSessionDataCookies(
      request,
      NextResponse.rewrite(rewriteUrl, { request: { headers: requestHeaders } })
    );
  }

  return cleanupSessionDataCookies(
    request,
    NextResponse.next({ request: { headers: requestHeaders } })
  );
}

function canonicalizeLocalhost(request: NextRequest) {
  if (!isDevelopment()) return null;

  const { root } = getRootParts();
  if (root.hostname === "localhost" || root.hostname === "127.0.0.1") return null;

  const { hostname } = splitHostPort(getHost(request));
  if (hostname !== "localhost" && !hostname.endsWith(".localhost")) return null;

  const slug = getLocalhostTenantSlug(hostname);
  if (slug && slug.includes(".")) return null;

  const target = new URL(request.nextUrl.pathname + request.nextUrl.search, root);
  target.hostname = slug ? `${slug}.${root.hostname}` : root.hostname;
  target.port = root.port;

  return target;
}

function getLocalhostTenantSlug(hostname: string) {
  if (hostname === "localhost") return null;
  if (!hostname.endsWith(".localhost")) return null;
  const slug = hostname.slice(0, -".localhost".length);
  return slug || null;
}

function debugTenantProxy(request: NextRequest, extra: { redirectTarget?: string } = {}) {
  if (!isDevelopment()) return;

  const host = getHost(request);
  const { root, rootDomain } = getRootParts();
  const { hostname } = splitHostPort(host);
  const tenantSlug = extractTenantSlugFromHost(host) ?? getLocalhostTenantSlug(hostname);
  const isRootDomain =
    hostname === root.hostname ||
    hostname === rootDomain ||
    hostname === "localhost";
  const isTenantSubdomain = Boolean(tenantSlug);

  console.log("[tenant-proxy]", {
    host,
    tenantSlug,
    isRootDomain,
    isTenantSubdomain,
    pathname: request.nextUrl.pathname,
    redirectTarget: extra.redirectTarget ?? null,
  });
}

async function resolveUserTenantFallback(userId: string, activeOrganizationId?: string | null) {
  const { prisma } = await import("@/lib/prisma");
  const memberships = await prisma.member.findMany({
    where: {
      userId,
      status: "active",
      organization: { status: "active" },
    },
    orderBy: { createdAt: "asc" },
    select: {
      organization: {
        select: { id: true, slug: true },
      },
    },
  });

  const activeMembership = activeOrganizationId
    ? memberships.find((membership) => membership.organization.id === activeOrganizationId)
    : null;

  return activeMembership ?? (memberships.length === 1 ? memberships[0] : null);
}

export default async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (isStaticOrInternal(pathname)) {
    return passThrough(request);
  }

  const canonicalTarget = canonicalizeLocalhost(request);
  if (canonicalTarget) {
    return redirect(request, canonicalTarget);
  }

  debugTenantProxy(request);

  const host = getHost(request);
  const tenantSlug = extractTenantSlugFromHost(host);
  const isTenantSubdomain = Boolean(tenantSlug);

  if (isSharedApiRoute(pathname) || (!isTenantSubdomain && isRootTenantApiRoute(pathname))) {
    return passThrough(request);
  }

  if (isTenantSubdomain && tenantSlug) {
    if (isRootOnlyRoute(pathname)) {
      const target = buildRootUrl(pathname, request.nextUrl.search);
      return redirect(request, target);
    }

    if (!isTenantRoute(pathname)) {
      const target = buildRootUrl("/tenant-not-found");
      target.searchParams.set("tenant", tenantSlug);
      return redirect(request, target);
    }

    if (!hasSessionTokenCookie(request)) {
      if (isApiRoute(pathname)) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
      }

      return redirect(request, buildLoginRedirect(request));
    }

    return rewriteWithTenantHeaders(request, tenantSlug);
  }

  if (AUTH_ROUTES.has(pathname)) {
    if (!hasSessionTokenCookie(request)) {
      return passThrough(request);
    }
    const session = await getSession(request);
    if (session?.user?.id) {
      const callbackUrl = request.nextUrl.searchParams.get("callbackUrl");
      if (callbackUrl && isSafeCallbackUrl(callbackUrl)) {
        return redirect(request, new URL(callbackUrl));
      }
      return redirect(request, buildRootUrl("/tenants"));
    }
    return passThrough(request);
  }

  if (isRootOnlyRoute(pathname) || pathname === "/") {
    return passThrough(request);
  }

  if (isTenantRoute(pathname)) {
    const session = await getSession(request);
    if (!session?.user?.id) {
      return redirect(request, buildLoginRedirect(request));
    }

    const activeOrgId = session.session?.activeOrganizationId;
    if (activeOrgId) {
      const { prisma } = await import("@/lib/prisma");
      const membership = await prisma.member.findUnique({
        where: {
          organizationId_userId: {
            organizationId: activeOrgId,
            userId: session.user.id,
          },
        },
        select: {
          status: true,
          organization: {
            select: { slug: true, status: true },
          },
        },
      });

      if (membership?.status === "active" && membership.organization.status === "active") {
        return redirect(request, buildTenantUrl(membership.organization.slug, pathname, request.nextUrl.search));
      }
    }

    const fallback = await resolveUserTenantFallback(session.user.id);
    if (fallback?.organization.slug) {
      return redirect(request, buildTenantUrl(fallback.organization.slug, pathname, request.nextUrl.search));
    }

    return redirect(request, buildRootUrl("/tenants"));
  }

  return passThrough(request);
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|api/auth|favicon.ico|.*\\.(?:avif|css|gif|ico|jpeg|jpg|js|json|map|mp3|mp4|otf|pdf|png|svg|ttf|txt|webmanifest|webp|woff|woff2)$).*)",
  ],
};
