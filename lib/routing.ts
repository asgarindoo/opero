

export function getRootUrl(): string {
  return (
    process.env.NEXT_PUBLIC_ROOT_URL ||
    process.env.ROOT_URL ||
    "http://lvh.me:3000"
  );
}

export function getAppDomain(): string {
  return process.env.NEXT_PUBLIC_ROOT_DOMAIN || new URL(getRootUrl()).hostname;
}

export function splitHostPort(host: string): { hostname: string; port: string } {
  const lower = host.toLowerCase();
  const idx = lower.lastIndexOf(":");
  if (idx === -1) return { hostname: lower, port: "" };
  const after = lower.slice(idx + 1);
  if (/^\d+$/.test(after)) {
    return { hostname: lower.slice(0, idx), port: after };
  }
  return { hostname: lower, port: "" };
}

// Subdomain yang di Ban
const RESERVED_SUBDOMAINS = new Set([
  "www", "app", "api", "auth", "admin", "mail",
  "smtp", "ftp", "cdn", "static", "assets", "opero",
]);

export function isReservedSubdomain(slug: string): boolean {
  return RESERVED_SUBDOMAINS.has(slug.toLowerCase());
}

export function extractTenantSlugFromHost(host: string): string | null {
  const { hostname } = splitHostPort(host);
  const appDomain = getAppDomain();

  // Root host
  if (hostname === appDomain) return null;

  // Tenant subdomain (*.domain)
  if (hostname.endsWith(`.${appDomain}`)) {
    const slug = hostname.slice(0, -(`.${appDomain}`.length));
    if (!slug || slug.includes(".") || isReservedSubdomain(slug)) return null;
    return slug;
  }

  return null;
}

export function isRootHost(host: string): boolean {
  return extractTenantSlugFromHost(host) === null;
}

export function buildRootUrl(path: string, search?: string): URL {
  const url = new URL(path, getRootUrl());
  if (search !== undefined) url.search = search;
  return url;
}

export function buildTenantUrl(slug: string, path: string, search?: string): URL {
  const root = new URL(getRootUrl());
  const port = root.port ? `:${root.port}` : "";
  const appDomain = getAppDomain();
  const url = new URL(`${root.protocol}//${slug}.${appDomain}${port}${path}`);
  if (search !== undefined) url.search = search;
  return url;
}

