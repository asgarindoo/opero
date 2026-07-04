"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { authClient } from "@/lib/auth-client";
import { getRootAppUrl } from "@/lib/tenant-url";

const AUTH_TIMEOUT_MS = 15000;

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

export default function RegisterPage() {
  const router = useRouter();
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [focused, setFocused] = useState<string | null>(null);
  const [agree, setAgree] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [form, setForm] = useState({ fullName: "", email: "", password: "" });
  const set = (key: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((f) => ({ ...f, [key]: e.target.value }));

  useEffect(() => {
    const { hostname, pathname, search } = window.location;
    if (hostname.endsWith(".localhost")) {
      window.location.replace(getRootAppUrl(`${pathname}${search}`));
    }
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!agree) {
      setError("Please accept the Terms of Service and Privacy Policy first.");
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const { error: authError } = await withAuthTimeout(
        authClient.signUp.email({
          name: form.fullName,
          email: form.email,
          password: form.password,
        }),
        "Create account"
      );

      if (authError) {
        setError(authError.message ?? "Could not create account. Please try again.");
        return;
      }

      // New users always go to onboarding (no tenant yet)
      router.push("/onboarding");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create account. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };

  const strength = Math.min(4, Math.floor(form.password.length / 3));

  const fieldStyle = (field: string) => ({
    borderColor: focused === field ? "var(--color-primary)" : "rgba(116,120,120,0.2)",
    boxShadow: focused === field ? "0 0 0 3px rgba(0,0,0,0.06)" : "none",
  });

  return (
    <div className="min-h-screen flex relative overflow-hidden">
      {/* bg dot-grid — mirrors login but mask from right */}
      <div
        className="absolute inset-0 -z-10 pointer-events-none opacity-40"
        style={{
          backgroundImage: "radial-gradient(circle, currentColor 1px, transparent 1px)",
          backgroundSize: "28px 28px",
          color: "var(--color-outline)",
          maskImage: "radial-gradient(ellipse 120% 100% at 80% 50%, black 30%, transparent 100%)",
          WebkitMaskImage: "radial-gradient(ellipse 120% 100% at 80% 50%, black 30%, transparent 100%)",
        }}
      />

      {/* ── Left form panel ── */}
      <main className="flex-1 flex flex-col items-center justify-center px-5 sm:px-10 py-16">

        {/* Mobile logo */}
        <div className="lg:hidden mb-10">
          <Link href="/" className="font-display font-bold tracking-[-0.05em] text-primary" style={{ fontSize: 26 }}>
            OP<span className="opacity-25">E</span>RO
          </Link>
        </div>

        <div className="w-full max-w-[420px] animate-fade-in-up">

          {/* Heading */}
          <div className="mb-8">
            <span className="font-label-caps text-[10px] uppercase tracking-[0.08em] font-semibold text-on-surface-variant/60 block mb-2">
              Free forever · no credit card
            </span>
            <h1
              className="font-display text-primary font-bold leading-[1.1]"
              style={{ fontSize: "clamp(26px, 4vw, 34px)", letterSpacing: "-0.02em" }}
            >
              Create your account
            </h1>

          </div>

          {/* Google OAuth */}
          <div className="mb-6">
            <button
              id="register-google"
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
            <span className="font-label-caps text-[10px] uppercase tracking-[0.06em] text-on-surface-variant/40 font-semibold">or with email</span>
            <div className="flex-1 h-px bg-outline/12" />
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit} className="flex flex-col gap-4" noValidate>

            {/* Full Name */}
            <div className="flex flex-col gap-1.5">
              <label htmlFor="reg-name" className="font-label-caps text-[10px] uppercase tracking-[0.06em] font-semibold text-on-surface-variant">
                Full Name
              </label>
              <div className="relative">
                <span className="material-symbols-outlined absolute left-3.5 top-1/2 -translate-y-1/2 text-[16px] text-on-surface-variant/40 pointer-events-none">person</span>
                <input
                  id="reg-name" type="text" autoComplete="name" required placeholder="Alex Johnson"
                  value={form.fullName} onChange={set("fullName")}
                  onFocus={() => setFocused("name")} onBlur={() => setFocused(null)}
                  className="w-full pl-10 pr-4 py-3 rounded-xl border bg-surface-container-lowest text-primary font-body-md text-[14px] placeholder:text-on-surface-variant/30 outline-none transition-all duration-200"
                  style={fieldStyle("name")}
                />
              </div>
            </div>

            {/* Email */}
            <div className="flex flex-col gap-1.5">
              <label htmlFor="reg-email" className="font-label-caps text-[10px] uppercase tracking-[0.06em] font-semibold text-on-surface-variant">
                Email
              </label>
              <div className="relative">
                <span className="material-symbols-outlined absolute left-3.5 top-1/2 -translate-y-1/2 text-[16px] text-on-surface-variant/40 pointer-events-none">mail</span>
                <input
                  id="reg-email" type="email" autoComplete="email" required placeholder="you@gmail.com"
                  value={form.email} onChange={set("email")}
                  onFocus={() => setFocused("email")} onBlur={() => setFocused(null)}
                  className="w-full pl-10 pr-4 py-3 rounded-xl border bg-surface-container-lowest text-primary font-body-md text-[14px] placeholder:text-on-surface-variant/30 outline-none transition-all duration-200"
                  style={fieldStyle("email")}
                />
              </div>
            </div>

            {/* Password */}
            <div className="flex flex-col gap-1.5">
              <label htmlFor="reg-password" className="font-label-caps text-[10px] uppercase tracking-[0.06em] font-semibold text-on-surface-variant">
                Password
              </label>
              <div className="relative">
                <span className="material-symbols-outlined absolute left-3.5 top-1/2 -translate-y-1/2 text-[16px] text-on-surface-variant/40 pointer-events-none">lock</span>
                <input
                  id="reg-password" type={showPassword ? "text" : "password"} autoComplete="new-password"
                  required placeholder="Min. 8 characters"
                  value={form.password} onChange={set("password")}
                  onFocus={() => setFocused("password")} onBlur={() => setFocused(null)}
                  className="w-full pl-10 pr-11 py-3 rounded-xl border bg-surface-container-lowest text-primary font-body-md text-[14px] placeholder:text-on-surface-variant/30 outline-none transition-all duration-200"
                  style={fieldStyle("password")}
                />
                <button
                  type="button" id="toggle-reg-password"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3.5 top-1/2 -translate-y-1/2 text-on-surface-variant/40 hover:text-on-surface-variant transition-colors duration-200"
                  aria-label={showPassword ? "Hide password" : "Show password"}
                >
                  <span className="material-symbols-outlined text-[16px]">{showPassword ? "visibility_off" : "visibility"}</span>
                </button>
              </div>
              {/* Strength bars */}
              {form.password.length > 0 && (
                <div className="flex gap-1 mt-0.5">
                  {[1, 2, 3, 4].map((lvl) => (
                    <div key={lvl} className="flex-1 h-1 rounded-full transition-all duration-300"
                      style={{
                        background: lvl <= strength
                          ? strength <= 1 ? "#ba1a1a" : strength <= 2 ? "#d97706" : strength <= 3 ? "#0891b2" : "#16a34a"
                          : "rgba(116,120,120,0.15)",
                      }}
                    />
                  ))}
                </div>
              )}
            </div>

            {/* Terms */}
            <label htmlFor="reg-agree" className="flex items-start gap-3 cursor-pointer">
              <div className="relative mt-0.5 shrink-0">
                <input id="reg-agree" type="checkbox" required checked={agree} onChange={(e) => setAgree(e.target.checked)} className="sr-only" />
                <div
                  className="w-4 h-4 rounded border transition-all duration-200 flex items-center justify-center"
                  style={{ background: agree ? "var(--color-primary)" : "transparent", borderColor: agree ? "var(--color-primary)" : "rgba(116,120,120,0.3)" }}
                >
                  {agree && <span className="material-symbols-outlined text-white text-[11px]">check</span>}
                </div>
              </div>
              <span className="font-body-sm text-[13px] text-on-surface-variant leading-relaxed">
                I agree to the{" "}
                <Link href="/terms" className="text-primary font-semibold hover:underline underline-offset-2">Terms of Service</Link>
                {" "}and{" "}
                <Link href="/privacy" className="text-primary font-semibold hover:underline underline-offset-2">Privacy Policy</Link>.
              </span>
            </label>

            {/* Error message */}
            {error && (
              <p className="text-[12px] font-body-sm" style={{ color: "var(--color-error, #ba1a1a)" }}>
                {error}
              </p>
            )}

            {/* Submit */}
            <button
              id="register-submit" type="submit" disabled={isLoading}
              className="mt-2 w-full bg-primary text-on-primary font-label-caps text-[11px] uppercase tracking-[0.05em] font-semibold px-6 py-3.5 rounded-xl flex items-center justify-center gap-2 hover:bg-primary/90 active:scale-[0.98] disabled:opacity-60 disabled:cursor-not-allowed transition-all duration-200 shadow-[0_4px_16px_rgba(0,0,0,0.12)] hover:shadow-[0_8px_24px_rgba(0,0,0,0.16)] hover:-translate-y-px"
            >
              {isLoading ? (
                <><span className="w-4 h-4 rounded-full border-2 border-white/30 border-t-white animate-spin" aria-hidden="true" />Creating account…</>
              ) : (
                <>Create Account<span className="material-symbols-outlined text-[15px]">arrow_forward</span></>
              )}
            </button>
          </form>

          <p className="mt-6 text-center font-body-sm text-[13px] text-on-surface-variant">
            Already have an account?{" "}
            <Link href="/login" className="font-semibold text-primary hover:underline underline-offset-2 transition-all duration-200">
              Sign in
            </Link>
          </p>
        </div>
      </main>

      {/* ── Right brand panel — same structure as login's left panel ── */}
      <aside className="hidden lg:flex flex-col justify-between w-[480px] xl:w-[540px] shrink-0 p-12 xl:p-16 bg-[#0f0f0f] relative overflow-hidden rounded-l-[2.5rem]">
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
            &ldquo;Build smarter operations from day one.&rdquo;
          </blockquote>
          <p className="font-body-md text-[14px] text-white/40 leading-relaxed max-w-xs">
            Create your account and start managing projects, workflows, teams, and business operations in one connected platform.
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
    </div>
  );
}
