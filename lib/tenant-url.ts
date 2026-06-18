const ROOT_URL =
  process.env.NEXT_PUBLIC_ROOT_URL ||
  (typeof window !== "undefined" ? `${window.location.protocol}//${window.location.host}` : "http://lvh.me:3000");

function getRootParsed() {
  return new URL(ROOT_URL);
}

export function isValidTenantSlug(slug: unknown): slug is string {
  return typeof slug === "string" && /^[a-z0-9-]{2,30}$/.test(slug);
}

export function getRootAppUrl(path = "/") {
  const root = getRootParsed();
  const url = new URL(path, root.href);
  return url.toString();
}

export function getTenantDashboardUrl(slug: string, path = "/dashboard"): string {
  if (!isValidTenantSlug(slug)) return getRootAppUrl("/tenants");

  const root = getRootParsed();
  const rootDomain = process.env.NEXT_PUBLIC_ROOT_DOMAIN || root.hostname;
  return `${root.protocol}//${getTenantHost(slug, rootDomain)}${path}`;
}

export function getTenantHost(slug: string, rootDomain?: string): string {
  const root = getRootParsed();
  const domain = rootDomain || process.env.NEXT_PUBLIC_ROOT_DOMAIN || root.hostname;
  const portSuffix = root.port ? `:${root.port}` : "";
  return `${slug}.${domain}${portSuffix}`;
}

const LAST_TENANT_KEY = "opero:last-tenant";

export function rememberTenant(tenant: { id: string; slug: string }) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(LAST_TENANT_KEY, JSON.stringify(tenant));
}

export function getRememberedTenant(): { id: string; slug: string } | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(LAST_TENANT_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { id?: unknown; slug?: unknown };
    if (typeof parsed.id !== "string" || typeof parsed.slug !== "string") return null;
    return { id: parsed.id, slug: parsed.slug };
  } catch {
    return null;
  }
}
