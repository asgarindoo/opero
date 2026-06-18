"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { authClient } from "@/lib/auth-client";
import { getTenantDashboardUrl, rememberTenant, getRootAppUrl, isValidTenantSlug } from "@/lib/tenant-url";

const AUTH_TIMEOUT_MS = 15000;
type TenantSummary = {
  id: string;
  name: string;
  slug: string;
  role: string;
  logo?: string | null;
};

async function withAuthTimeout<T>(request: Promise<T>, action: string): Promise<T> {
  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => {
      reject(new Error(`${action} timed out. Please check your connection and try again.`));
    }, AUTH_TIMEOUT_MS);
  });

  try {
    return await Promise.race([request, timeout]);
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
  }
}

async function listUserTenants(): Promise<TenantSummary[]> {
  const res = await fetch("/api/tenant", { cache: "no-store" });
  const payload = await res.json().catch(() => ({}));

  if (!res.ok) {
    throw new Error(payload.error ?? "Unable to load workspaces.");
  }

  return ((payload.organizations ?? []) as TenantSummary[]).filter((org) => isValidTenantSlug(org.slug));
}

export default function LoginPage() {
  const router = useRouter();
  const [showPassword, setShowPassword] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [focused, setFocused] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Guard: Next.js client-side navigation to /login on a tenant subdomain
  // bypasses the proxy (no HTTP request = no server redirect).
  // Detect it here and hard-redirect to the absolute root login URL.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const { hostname } = window.location;
    const rootUrl = process.env.NEXT_PUBLIC_ROOT_URL || "http://lvh.me:3000";
    const rootHostname = new URL(rootUrl).hostname; // e.g. "lvh.me"
    const rootDomain = process.env.NEXT_PUBLIC_ROOT_DOMAIN || rootHostname;

    // We're on a tenant subdomain if the hostname has a "." prefix before the root domain
    const isTenantSubdomain =
      (hostname.endsWith(`.${rootDomain}`) &&
        hostname !== rootHostname &&
        hostname !== rootDomain) ||
      hostname.endsWith(".localhost");

    if (isTenantSubdomain) {
      const target = getRootAppUrl(`/login${window.location.search}`);
      console.log(`[LOGIN] client-side subdomain guard: ${hostname} → ${target}`);
      window.location.replace(target);
    }
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError(null);

    try {
      const { error: authError } = await withAuthTimeout(
        authClient.signIn.email({
          email,
          password,
        }),
        "Sign in"
      );

      if (authError) {
        setError(authError.message ?? "Invalid email or password.");
        return;
      }

      console.log("[LOGIN] ✓ signIn succeeded — checking session on root domain");

      // Check how many orgs the user belongs to for smart redirect
      const orgs = await withAuthTimeout(
        listUserTenants(),
        "Loading workspaces"
      );

      console.log(`[LOGIN] orgs count=${orgs.length}`, orgs.map((o) => o.slug));

      if (orgs.length === 0) {
        console.log("[LOGIN] no orgs → /onboarding/create");
        router.push("/onboarding/create");
        return;
      }

      const callbackUrl = getSafeCallbackUrl();
      const callbackTenantSlug = callbackUrl ? getTenantSlugFromUrl(callbackUrl) : null;
      const callbackOrg = callbackTenantSlug
        ? orgs.find((org) => org.slug === callbackTenantSlug) ?? null
        : null;

      console.log(`[LOGIN] callbackUrl=${callbackUrl ?? "(none)"}`);
      console.log(`[LOGIN] callbackTenantSlug=${callbackTenantSlug ?? "(none)"}`);

      // Routing decision
      // 1. callbackUrl -> user was trying to reach a specific tenant, go directly.
      // 2. Only 1 org -> go directly (no choice needed).
      // 3. Multiple orgs + no callback -> show /tenants picker so the user can choose.

      if (callbackTenantSlug && !callbackOrg) {
        console.log("[LOGIN] callback tenant not in user's org list -> /unauthorized");
        window.location.assign(getRootAppUrl("/unauthorized"));
        return;
      }

      if (!callbackOrg && orgs.length > 1) {
        // Multiple tenants, no specific destination — show the picker
        console.log(`[LOGIN] multiple orgs (${orgs.length}), no callback tenant -> /tenants`);
        window.location.assign(getRootAppUrl("/tenants"));
        return;
      }

      // Single org OR a callback tenant matched -> go directly
      const targetOrg = callbackOrg ?? orgs[0];
      console.log(`[LOGIN] targetOrg=${targetOrg ? JSON.stringify({ id: targetOrg.id, slug: targetOrg.slug }) : "(none)"}`);

      if (targetOrg) {
        await withAuthTimeout(
          authClient.organization.setActive({ organizationId: targetOrg.id }),
          "Selecting workspace"
        );
        console.log(`[LOGIN] setActive(${targetOrg.id}) done`);

        rememberTenant({ id: targetOrg.id, slug: targetOrg.slug });

        const dashboardUrl = getTenantDashboardUrl(targetOrg.slug);
        console.log(`[LOGIN] dashboardUrl=${dashboardUrl}`);


        const targetUrl = callbackUrl ?? dashboardUrl;
        console.log(`[LOGIN] redirecting to ${targetUrl}`);
        window.location.assign(targetUrl);
      }

    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not sign in. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex relative overflow-hidden">
      {/* bg dot-grid */}
      <div
        className="absolute inset-0 -z-10 pointer-events-none opacity-40"
        style={{
          backgroundImage: "radial-gradient(circle, currentColor 1px, transparent 1px)",
          backgroundSize: "28px 28px",
          color: "var(--color-outline)",
          maskImage: "radial-gradient(ellipse 120% 100% at 20% 50%, black 30%, transparent 100%)",
          WebkitMaskImage: "radial-gradient(ellipse 120% 100% at 20% 50%, black 30%, transparent 100%)",
        }}
      />

      {/* Left panel */}
      <aside className="hidden lg:flex flex-col justify-between w-[480px] xl:w-[540px] shrink-0 p-12 xl:p-16 bg-[#0f0f0f] relative overflow-hidden rounded-r-[2.5rem]">
        <div className="absolute top-0 left-[10%] right-[10%] h-px bg-gradient-to-r from-transparent via-white/10 to-transparent" />
        <div
          className="absolute inset-0 pointer-events-none"
          style={{ background: "radial-gradient(ellipse 80% 60% at 50% 0%, rgba(255,255,255,0.04) 0%, transparent 70%)" }}
        />

        <Link href="/" className="font-display font-bold tracking-[-0.05em] text-white relative z-10" style={{ fontSize: 26 }}>
          OP<span className="opacity-25">E</span>RO
        </Link>

        <div className="relative z-10">
          <div className="grid grid-cols-5 gap-[6px] mb-8 opacity-25">
            {Array.from({ length: 15 }).map((_, i) => (
              <div key={i} className="w-[4px] h-[4px] rounded-full bg-white" style={{ opacity: 0.2 + (i % 5) * 0.12 }} />
            ))}
          </div>
          <blockquote
            className="font-display text-white/90 leading-[1.2] mb-6"
            style={{ fontSize: "clamp(20px, 2vw, 28px)", letterSpacing: "-0.02em" }}
          >
            &ldquo;One system. Every operation. Zero friction.&rdquo;
          </blockquote>
          <p className="font-body-md text-[14px] text-white/40 leading-relaxed max-w-xs">
            Thousands of teams already manage their entire business workflow through OPERO.
          </p>
          <div className="mt-8 flex items-center gap-3">
            <div className="flex -space-x-2">
              {["JD", "AS", "MK", "LR"].map((initials, i) => (
                <div
                  key={initials}
                  className="w-8 h-8 rounded-full border-2 border-[#0f0f0f] flex items-center justify-center text-[10px] font-semibold text-white/80"
                  style={{ background: `hsl(${i * 40 + 200}, 12%, ${22 + i * 4}%)` }}
                >
                  {initials}
                </div>
              ))}
            </div>
            <span className="font-label-caps text-[10px] uppercase tracking-[0.06em] text-white/30 font-semibold">1,000+ teams active</span>
          </div>
        </div>

        <p className="font-body-sm text-[12px] text-white/20 relative z-10">© 2026 OPERO. All rights reserved.</p>
      </aside>

      {/* Right form */}
      <main className="flex-1 flex flex-col items-center justify-center px-5 sm:px-10 py-16">
        <div className="lg:hidden mb-10">
          <Link href="/" className="font-display font-bold tracking-[-0.05em] text-primary" style={{ fontSize: 26 }}>
            OP<span className="opacity-25">E</span>RO
          </Link>
        </div>

        <div className="w-full max-w-[420px] animate-fade-in-up">
          <div className="mb-8">
            <span className="font-label-caps text-[10px] uppercase tracking-[0.08em] font-semibold text-on-surface-variant/60 block mb-2">Welcome back</span>
            <h1 className="font-display text-primary font-bold leading-[1.1]" style={{ fontSize: "clamp(26px, 4vw, 34px)", letterSpacing: "-0.02em" }}>
              Sign in to OPERO
            </h1>
            <p className="mt-2 font-body-md text-[14px] text-on-surface-variant">Continue managing your operations.</p>
          </div>

          {/* Social buttons — Google only */}
          <div className="mb-6">
            <button
              id="login-google"
              type="button"
              className="w-full flex items-center justify-center gap-2.5 border border-outline/20 bg-surface-container-lowest text-primary font-label-caps text-[11px] uppercase tracking-[0.05em] font-semibold px-4 py-2.5 rounded-xl hover:bg-surface-container-low hover:border-outline/40 active:scale-[0.98] transition-all duration-200"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true">
                <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4" />
                <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
                <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
                <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
              </svg>
              Continue with Google
            </button>
          </div>

          {/* Divider */}
          <div className="flex items-center gap-3 mb-6">
            <div className="flex-1 h-px bg-outline/12" />
            <span className="font-label-caps text-[10px] uppercase tracking-[0.06em] text-on-surface-variant/40 font-semibold">or continue with email</span>
            <div className="flex-1 h-px bg-outline/12" />
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit} className="flex flex-col gap-4" noValidate>
            {/* Email field */}
            <div className="flex flex-col gap-1.5">
              <label htmlFor="login-email" className="font-label-caps text-[10px] uppercase tracking-[0.06em] font-semibold text-on-surface-variant">
                Email
              </label>
              <div className="relative">
                <span className="material-symbols-outlined absolute left-3.5 top-1/2 -translate-y-1/2 text-[16px] text-on-surface-variant/40 pointer-events-none">mail</span>
                <input
                  id="login-email"
                  type="email"
                  autoComplete="email"
                  required
                  placeholder="you@gmail.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  onFocus={() => setFocused("email")}
                  onBlur={() => setFocused(null)}
                  className="w-full pl-10 pr-4 py-3 rounded-xl border bg-surface-container-lowest text-primary font-body-md text-[14px] placeholder:text-on-surface-variant/30 outline-none transition-all duration-200"
                  style={{
                    borderColor: focused === "email" ? "var(--color-primary)" : "rgba(116,120,120,0.2)",
                    boxShadow: focused === "email" ? "0 0 0 3px rgba(0,0,0,0.06)" : "none",
                  }}
                />
              </div>
            </div>

            {/* Password field */}
            <div className="flex flex-col gap-1.5">
              <div className="flex items-center justify-between">
                <label htmlFor="login-password" className="font-label-caps text-[10px] uppercase tracking-[0.06em] font-semibold text-on-surface-variant">
                  Password
                </label>
                <Link href="/forgot-password" className="font-body-sm text-[12px] text-on-surface-variant/60 hover:text-primary transition-colors duration-200">
                  Forgot password?
                </Link>
              </div>
              <div className="relative">
                <span className="material-symbols-outlined absolute left-3.5 top-1/2 -translate-y-1/2 text-[16px] text-on-surface-variant/40 pointer-events-none">lock</span>
                <input
                  id="login-password"
                  type={showPassword ? "text" : "password"}
                  autoComplete="current-password"
                  required
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  onFocus={() => setFocused("password")}
                  onBlur={() => setFocused(null)}
                  className="w-full pl-10 pr-11 py-3 rounded-xl border bg-surface-container-lowest text-primary font-body-md text-[14px] placeholder:text-on-surface-variant/30 outline-none transition-all duration-200"
                  style={{
                    borderColor: focused === "password" ? "var(--color-primary)" : "rgba(116,120,120,0.2)",
                    boxShadow: focused === "password" ? "0 0 0 3px rgba(0,0,0,0.06)" : "none",
                  }}
                />
                <button
                  type="button"
                  id="toggle-login-password"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3.5 top-1/2 -translate-y-1/2 text-on-surface-variant/40 hover:text-on-surface-variant transition-colors duration-200"
                  aria-label={showPassword ? "Hide password" : "Show password"}
                >
                  <span className="material-symbols-outlined text-[16px]">{showPassword ? "visibility_off" : "visibility"}</span>
                </button>
              </div>
            </div>

            {/* Error message */}
            {error && (
              <p className="text-[12px] font-body-sm" style={{ color: "var(--color-error, #ba1a1a)" }}>
                {error}
              </p>
            )}

            {/* Submit */}
            <button
              id="login-submit"
              type="submit"
              disabled={isLoading}
              className="mt-2 w-full bg-primary text-on-primary font-label-caps text-[11px] uppercase tracking-[0.05em] font-semibold px-6 py-3.5 rounded-xl flex items-center justify-center gap-2 hover:bg-primary/90 active:scale-[0.98] disabled:opacity-60 disabled:cursor-not-allowed transition-all duration-200 shadow-[0_4px_16px_rgba(0,0,0,0.12)] hover:shadow-[0_8px_24px_rgba(0,0,0,0.16)] hover:-translate-y-px"
            >
              {isLoading ? (
                <>
                  <span className="w-4 h-4 rounded-full border-2 border-white/30 border-t-white animate-spin" aria-hidden="true" />
                  Signing in…
                </>
              ) : (
                <>
                  Sign In
                  <span className="material-symbols-outlined text-[15px]">arrow_forward</span>
                </>
              )}
            </button>
          </form>

          <p className="mt-6 text-center font-body-sm text-[13px] text-on-surface-variant">
            Don&apos;t have an account?{" "}
            <Link href="/register" className="font-semibold text-primary hover:underline underline-offset-2 transition-all duration-200">
              Start for free
            </Link>
          </p>

          {/* Trust badges */}
          <div className="mt-10 pt-6 border-t border-outline/10 flex flex-wrap items-center justify-center gap-x-5 gap-y-2">
            {[
              { icon: "shield", label: "SOC 2 Type II" },
              { icon: "lock", label: "256-bit SSL" },
              { icon: "privacy_tip", label: "GDPR Ready" },
            ].map((badge) => (
              <div key={badge.label} className="flex items-center gap-1.5 text-on-surface-variant/40">
                <span className="material-symbols-outlined text-[14px]">{badge.icon}</span>
                <span className="font-label-caps text-[10px] uppercase tracking-[0.05em] font-semibold">{badge.label}</span>
              </div>
            ))}
          </div>
        </div>
      </main>
    </div>
  );
}

function getRootDomainParts() {
  const root = new URL(process.env.NEXT_PUBLIC_ROOT_URL || "http://lvh.me:3000");
  const rootDomain = process.env.NEXT_PUBLIC_ROOT_DOMAIN || root.hostname;
  return { root, rootDomain };
}

function getSafeCallbackUrl() {
  if (typeof window === "undefined") return null;

  const raw = new URLSearchParams(window.location.search).get("callbackUrl");
  if (!raw) return null;

  try {
    const callback = new URL(raw);
    const { root, rootDomain } = getRootDomainParts();
    const isAllowedHost =
      callback.hostname === root.hostname ||
      callback.hostname === rootDomain ||
      callback.hostname.endsWith(`.${rootDomain}`);

    if (callback.protocol !== root.protocol || !isAllowedHost) return null;
    if (callback.pathname === "/login" || callback.pathname.startsWith("/api/auth")) return null;

    return callback.toString();
  } catch {
    return null;
  }
}

function getTenantSlugFromUrl(value: string) {
  try {
    const callback = new URL(value);
    const { root, rootDomain } = getRootDomainParts();
    if (callback.hostname === root.hostname || callback.hostname === rootDomain) return null;
    if (!callback.hostname.endsWith(`.${rootDomain}`)) return null;

    const slug = callback.hostname.slice(0, -(`.${rootDomain}`.length));
    if (!slug || slug.includes(".")) return null;
    return slug;
  } catch {
    return null;
  }
}

