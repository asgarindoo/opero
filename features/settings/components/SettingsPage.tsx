"use client";

import React, { useEffect, useRef, useState } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import {
  Building,
  CreditCard,
  Save,
  Upload,
  Globe,
  Shield,
  LogOut,
  Mail,
  UserRound,
  Copy,
  Check,
  AlertTriangle,
  Trash2,
} from "lucide-react";
import { authClient } from "@/lib/auth-client";
import { getTenantLogoSrc } from "@/lib/tenant-logo";
import { getRootAppUrl, getTenantHost } from "@/lib/tenant-url";
import { markPresenceOffline } from "@/features/presence";
import ModuleHeader from "@/components/common/ModuleHeader";
import ModuleTabs from "@/components/common/ModuleTabs";
import Button from "@/components/ui/Button";
import UserAvatar from "@/components/common/UserAvatar";
import ConfirmationModal from "@/components/common/ConfirmationModal";

type SettingsTab = "tenant" | "billing" | "security";
type SettingsForm = {
  name: string;
  logo: string | null;
  timezone: string;
  locale: string;
};

interface TenantSettingsResponse {
  tenant: {
    id: string;
    name: string;
    slug: string;
    logo: string | null;
    createdAt: string;
    tenantSettings: {
      timezone: string;
      locale: string;
      logoUrl: string | null;
    } | null;
    tenantPlan: {
      status: string;
      currentPeriodEnd: string | null;
      plan: {
        name: string;
        displayName: string;
        maxMembers: number;
        maxBots: number;
        features: unknown;
      };
    } | null;
  };
  membership: { role: string };
  user: { id: string; name: string; email: string; image: string | null } | null;
  usage: { membersCount: number };
}

const tabs = [
  { id: "tenant", label: "Tenant Info", icon: Building },
  { id: "billing", label: "Plan & Billing", icon: CreditCard },
  { id: "security", label: "Security", icon: Shield },
];

export default function SettingsPage() {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [activeTab, setActiveTab] = useState<SettingsTab>("tenant");
  const [data, setData] = useState<TenantSettingsResponse | null>(null);
  const [inviteCode, setInviteCode] = useState<string | null>(null);
  const [form, setForm] = useState<SettingsForm>({
    name: "",
    logo: "",
    timezone: "UTC",
    locale: "en",
  });
  const [initialForm, setInitialForm] = useState<SettingsForm | null>(null);
  const [loading, setLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isLeaving, setIsLeaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const [isLeaveModalOpen, setIsLeaveModalOpen] = useState(false);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [isRemoveLogoModalOpen, setIsRemoveLogoModalOpen] = useState(false);

  const copyToClipboard = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      // Fallback for older browsers
      const el = document.createElement("textarea");
      el.value = text;
      el.style.position = "fixed";
      el.style.opacity = "0";
      document.body.appendChild(el);
      el.focus();
      el.select();
      document.execCommand("copy");
      document.body.removeChild(el);
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const canManage = data?.membership.role === "owner" || data?.membership.role === "admin";
  const isOwner = data?.membership.role === "owner";

  useEffect(() => {
    let cancelled = false;

    async function loadSettings() {
      setLoading(true);
      setError(null);
      try {
        const [settingsRes, inviteRes] = await Promise.all([
          fetch("/api/tenant/settings", { cache: "no-store" }),
          fetch("/api/tenant/invite"),
        ]);
        const payload = await settingsRes.json();

        if (!settingsRes.ok) {
          throw new Error(payload.error ?? "Failed to load settings.");
        }

        if (cancelled) return;
        setData(payload);
        const logo = payload.tenant.logo ?? payload.tenant.tenantSettings?.logoUrl ?? null;
        const nextForm = {
          name: payload.tenant.name,
          logo: getTenantLogoSrc(payload.tenant.id, logo),
          timezone: payload.tenant.tenantSettings?.timezone ?? "UTC",
          locale: payload.tenant.tenantSettings?.locale ?? "en",
        };
        setForm(nextForm);
        setInitialForm(nextForm);

        if (inviteRes.ok) {
          const invitePayload = await inviteRes.json();
          if (!cancelled) setInviteCode(invitePayload.inviteCode ?? null);
        }
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "Failed to load settings.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    loadSettings();
    return () => {
      cancelled = true;
    };
  }, []);

  const hasTenantChanges = Boolean(initialForm && (
    form.name !== initialForm.name ||
    form.logo !== initialForm.logo ||
    form.timezone !== initialForm.timezone ||
    form.locale !== initialForm.locale
  ));

  useEffect(() => {
    if (!message) return;
    const timer = window.setTimeout(() => setMessage(null), 3000);
    return () => window.clearTimeout(timer);
  }, [message]);

  const handleFile = (file: File) => {
    if (!file.type.startsWith("image/")) return;
    const reader = new FileReader();
    reader.onload = (event) => setForm((current) => ({ ...current, logo: event.target?.result as string }));
    reader.readAsDataURL(file);
  };

  const handleCancelTenantChanges = () => {
    if (!initialForm) return;
    setForm(initialForm);
    setMessage(null);
    setError(null);
    setIsRemoveLogoModalOpen(false);

    if (fileRef.current) {
      fileRef.current.value = "";
    }
  };

  const handleSave = async () => {
    if (!canManage || !hasTenantChanges) return;

    setIsSaving(true);
    setMessage(null);
    setError(null);

    try {
      const logoWasChanged = form.logo !== initialForm?.logo;
      const res = await fetch("/api/tenant/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: form.name,
          timezone: form.timezone,
          locale: form.locale,
          ...(logoWasChanged ? { logo: form.logo ?? "" } : {}),
        }),
      });
      const payload = await res.json();

      if (!res.ok) {
        throw new Error(payload.error ?? "Failed to save settings.");
      }

      setData((current) => current ? {
        ...current,
        tenant: {
          ...current.tenant,
          name: payload.tenant.name,
          logo: getTenantLogoSrc(payload.tenant.id, payload.tenant.logo),
          tenantSettings: payload.tenant.tenantSettings,
        },
      } : current);
      const savedForm = {
        name: payload.tenant.name,
        logo: getTenantLogoSrc(payload.tenant.id, payload.tenant.logo),
        timezone: payload.tenant.tenantSettings?.timezone ?? "UTC",
        locale: payload.tenant.tenantSettings?.locale ?? "en",
      };
      setForm(savedForm);
      setInitialForm(savedForm);
      await authClient.organization.setActive({ organizationId: data?.tenant.id });
      setMessage("Settings saved.");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save settings.");
    } finally {
      setIsSaving(false);
    }
  };

  const handleSignOut = async () => {
    await markPresenceOffline().catch(() => null);
    window.location.assign(getRootAppUrl("/logout"));
  };

  const handleLeaveTenant = async () => {
    if (!data) return;

    setIsLeaving(true);
    setError(null);
    setMessage(null);

    try {
      const res = await fetch("/api/tenant/leave", { method: "POST" });
      const payload = await res.json();

      if (!res.ok) {
        throw new Error(payload.error ?? "Failed to leave tenant.");
      }

      await authClient.organization.setActive({ organizationId: null });
      window.location.assign(getRootAppUrl("/"));
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to leave tenant.");
      setIsLeaveModalOpen(false);
    } finally {
      setIsLeaving(false);
    }
  };

  const handleDeleteTenant = async () => {
    if (!data || !isOwner) return;

    setIsDeleting(true);
    setError(null);
    setMessage(null);

    try {
      const res = await fetch("/api/tenant", { method: "DELETE" });
      const payload = await res.json();

      if (!res.ok) {
        throw new Error(payload.error ?? "Failed to delete tenant.");
      }

      await authClient.organization.setActive({ organizationId: null });
      window.location.assign(getRootAppUrl("/"));
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete tenant.");
      setIsDeleteModalOpen(false);
    } finally {
      setIsDeleting(false);
    }
  };

  const plan = data?.tenant.tenantPlan;
  const membersMax = plan?.plan.maxMembers ?? 0;
  const membersCount = data?.usage.membersCount ?? 0;
  const membersPct = membersMax > 0 ? Math.min(100, Math.round((membersCount / membersMax) * 100)) : 0;

  return (
    <div className="flex flex-col h-full overflow-hidden bg-background text-on-surface">
      <ModuleHeader
        title="Settings"
      />

      <ModuleTabs
        tabs={tabs}
        activeTab={activeTab}
        onTabChange={(id) => setActiveTab(id as SettingsTab)}
        background="bg-black/[0.01]"
      />

      <div className="flex-1 overflow-y-auto px-5 py-8 sm:px-10">
        <div className="mx-auto max-w-[800px] pb-20">
          {loading ? (
            <div className="space-y-12 animate-pulse">
              <div className="space-y-6">
                <div className="h-5 w-32 rounded bg-black/[0.04]" />
                <div className="flex gap-6 items-center">
                  <div className="h-24 w-24 rounded-xl bg-black/[0.05]" />
                  <div className="space-y-3">
                    <div className="h-8 w-32 rounded-[6px] bg-black/[0.04]" />
                    <div className="h-4 w-48 rounded-[4px] bg-black/[0.03]" />
                  </div>
                </div>
              </div>
              <div className="space-y-6">
                <div className="h-5 w-40 rounded bg-black/[0.04]" />
                <div className="grid gap-6 sm:grid-cols-2">
                  <div className="h-10 w-full rounded-[6px] bg-black/[0.03]" />
                  <div className="h-10 w-full rounded-[6px] bg-black/[0.03]" />
                </div>
              </div>
            </div>
          ) : error && !data ? (
            <div className="rounded-xl border border-red-500/15 bg-red-500/[0.03] p-8 text-[13px] text-red-600">
              {error}
            </div>
          ) : data ? (
            <div className="space-y-12">
              {(message || error) && (
                <div
                  className="rounded-[8px] border px-4 py-3 text-[13px] font-medium"
                  style={{
                    borderColor: error ? "rgba(220,38,38,0.18)" : "rgba(22,163,74,0.2)",
                    background: error ? "rgba(220,38,38,0.035)" : "rgba(22,163,74,0.04)",
                    color: error ? "#dc2626" : "#15803d",
                  }}
                >
                  {error ?? message}
                </div>
              )}

              {!canManage && activeTab === "tenant" && (
                <div className="rounded-[8px] border border-black/[0.06] bg-black/[0.02] px-4 py-3 text-[13px] text-on-surface-variant font-medium">
                  You can view settings, but only owners and admins can edit them.
                </div>
              )}

              {activeTab === "tenant" && (
                <>
                  {/* Workspace Identity Section */}
                  <section>
                    <div className="border-b border-black/[0.06] pb-4 mb-6">
                      <h2 className="text-[14px] font-semibold text-on-surface">Logo</h2>
                    </div>
                    <div className="flex items-center gap-6">
                      <div className="w-24 h-24 rounded-xl bg-white border border-black/[0.08] flex items-center justify-center overflow-hidden shrink-0 shadow-sm relative text-on-surface-variant">
                        {form.logo ? (
                          <Image src={form.logo} alt="Logo" fill sizes="96px" className="object-cover" unoptimized />
                        ) : (
                          <Building size={32} className="opacity-40" />
                        )}
                      </div>
                      <div className="space-y-3">
                        <div className="flex flex-wrap items-center gap-2">
                          <input
                            ref={fileRef}
                            type="file"
                            accept="image/*"
                            className="sr-only"
                            onChange={(e) => {
                              const file = e.target.files?.[0];
                              if (file) handleFile(file);
                            }}
                          />
                          <Button
                            type="button"
                            variant="secondary"
                            size="sm"
                            icon={Upload}
                            disabled={!canManage}
                            onClick={() => fileRef.current?.click()}
                          >
                            {form.logo ? "Replace" : "Upload"}
                          </Button>
                          {form.logo && canManage && (
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              icon={Trash2}
                              onClick={() => setIsRemoveLogoModalOpen(true)}
                              className="text-red-600 hover:bg-red-50 hover:text-red-700"
                            >
                              Remove
                            </Button>
                          )}
                        </div>
                        <p className="text-[12px] text-on-surface-variant opacity-80">
                          Recommended size: 256x256px. PNG, JPG, or WEBP.
                        </p>
                      </div>
                    </div>
                  </section>

                  {/* General Settings Section */}
                  <section>
                    <div className="border-b border-black/[0.06] pb-4 mb-6">
                      <h2 className="text-[14px] font-semibold text-on-surface">General Settings</h2>
                    </div>
                    <div className="grid gap-6 sm:grid-cols-2">
                      <div>
                        <label className="mb-2 block font-medium text-[13px] text-on-surface">Tenant Name</label>
                        <input
                          type="text"
                          value={form.name}
                          disabled={!canManage}
                          onChange={(e) => setForm({ ...form, name: e.target.value })}
                          className="h-10 w-full rounded-[6px] border border-black/[0.12] bg-white px-3 text-[13px] outline-none transition-colors focus:border-black/30 focus:ring-2 focus:ring-black/5 disabled:bg-black/[0.02] disabled:text-on-surface-variant"
                        />
                      </div>

                      <div>
                        <label className="mb-2 block font-medium text-[13px] text-on-surface">Subdomain</label>
                        <input
                          type="text"
                          value={getTenantHost(data.tenant.slug)}
                          readOnly
                          className="h-10 w-full cursor-not-allowed rounded-[6px] border border-black/[0.06] bg-black/[0.02] px-3 text-[13px] text-on-surface-variant outline-none"
                        />
                      </div>

                      <div>
                        <label className="mb-2 block font-medium text-[13px] text-on-surface">Creation Date</label>
                        <input
                          type="text"
                          value={new Date(data.tenant.createdAt).toLocaleDateString()}
                          readOnly
                          className="h-10 w-full cursor-not-allowed rounded-[6px] border border-black/[0.06] bg-black/[0.02] px-3 text-[13px] text-on-surface-variant outline-none"
                        />
                      </div>

                      <div>
                        <label className="mb-2 block font-medium text-[13px] text-on-surface">Total Members</label>
                        <input
                          type="text"
                          value={membersCount.toString()}
                          readOnly
                          className="h-10 w-full cursor-not-allowed rounded-[6px] border border-black/[0.06] bg-black/[0.02] px-3 text-[13px] text-on-surface-variant outline-none"
                        />
                      </div>
                    </div>
                  </section>

                  {/* Invitation Code Section */}
                  <section>
                    <div className="border-b border-black/[0.06] pb-4 mb-6">
                      <h2 className="text-[14px] font-semibold text-on-surface">Invitation Code</h2>
                    </div>
                    <div>
                      <label className="mb-2 block font-medium text-[13px] text-on-surface">Share this code with your team</label>
                      <div className="relative group max-w-sm">
                        {inviteCode ? (
                          <input
                            type="text"
                            readOnly
                            value={inviteCode}
                            className="h-10 w-full cursor-default rounded-[6px] border border-black/[0.12] bg-white px-3 text-[14px] font-bold tracking-[0.15em] text-on-surface outline-none select-all"
                          />
                        ) : (
                          <div className="h-10 w-full rounded-[6px] bg-black/[0.02] border border-black/[0.04] animate-pulse" />
                        )}
                        <button
                          onClick={() => inviteCode && copyToClipboard(inviteCode)}
                          disabled={!inviteCode}
                          className="absolute right-1 top-1/2 -translate-y-1/2 p-1.5 hover:bg-black/[0.05] rounded-[4px] transition-colors text-on-surface-variant opacity-60 hover:opacity-100 disabled:opacity-30 disabled:cursor-not-allowed"
                          title="Copy invite code"
                        >
                          {copied ? <Check size={14} className="text-green-600" /> : <Copy size={14} />}
                        </button>
                      </div>
                    </div>
                  </section>

                  {canManage && (
                    <div className="border-t border-black/[0.06] pt-5">
                      <div className="flex items-center justify-end gap-2">
                        <Button
                          type="button"
                          variant="secondary"
                          size="sm"
                          disabled={!hasTenantChanges || isSaving}
                          onClick={handleCancelTenantChanges}
                        >
                          Cancel
                        </Button>
                        <Button
                          type="button"
                          variant="primary"
                          size="sm"
                          icon={Save}
                          isLoading={isSaving}
                          disabled={!hasTenantChanges}
                          onClick={handleSave}
                        >
                          Save Changes
                        </Button>
                      </div>
                    </div>
                  )}
                </>
              )}

              {activeTab === "billing" && (
                <>
                  <section>
                    <div className="border-b border-black/[0.06] pb-4 mb-6">
                      <h2 className="text-[14px] font-semibold text-on-surface">Current Plan Overview</h2>
                    </div>
                    <div className="grid gap-6 sm:grid-cols-2">
                      <div>
                        <label className="mb-2 block font-medium text-[13px] text-on-surface">Active Plan</label>
                        <div className="h-10 w-full rounded-[6px] border border-black/[0.06] bg-black/[0.02] px-3 flex items-center gap-2">
                          <div className="w-2 h-2 rounded-full bg-green-500" />
                          <span className="text-[13px] font-semibold">{plan?.plan.displayName ?? "Free"}</span>
                        </div>
                      </div>
                      <div>
                        <label className="mb-2 block font-medium text-[13px] text-on-surface">Period End</label>
                        <input
                          type="text"
                          value={plan?.currentPeriodEnd ? new Date(plan.currentPeriodEnd).toLocaleDateString() : "Lifetime"}
                          readOnly
                          className="h-10 w-full cursor-not-allowed rounded-[6px] border border-black/[0.06] bg-black/[0.02] px-3 text-[13px] text-on-surface-variant outline-none"
                        />
                      </div>

                      <div className="sm:col-span-2">
                        <label className="mb-2 block font-medium text-[13px] text-on-surface">Member Usage</label>
                        <div className="rounded-[6px] border border-black/[0.06] bg-black/[0.02] p-4">
                          <div className="flex justify-between font-medium text-[13px] mb-2">
                            <span className="text-on-surface-variant">Active Members</span>
                            <span className="text-on-surface">
                              {membersCount}{membersMax > 0 ? ` / ${membersMax}` : ""}
                            </span>
                          </div>
                          <div className="h-1.5 w-full bg-black/[0.06] rounded-full overflow-hidden">
                            <div className="h-full bg-primary" style={{ width: `${membersPct}%` }} />
                          </div>
                        </div>
                      </div>
                    </div>
                  </section>

                  <section>
                    <div className="border-b border-black/[0.06] pb-4 mb-6">
                      <h2 className="text-[14px] font-semibold text-on-surface">Available Plans</h2>
                    </div>
                    <div className="grid gap-6 sm:grid-cols-2">
                      {/* Free Plan */}
                      <div className="rounded-[8px] border border-black/[0.12] bg-white p-6 flex flex-col relative overflow-hidden">
                        <div className="mb-4">
                          <span className="text-[11px] uppercase tracking-[0.1em] font-bold text-on-surface-variant">Free</span>
                          <div className="flex items-end gap-1.5 mt-1 mb-2">
                            <span className="text-[32px] leading-none font-bold tracking-tight text-primary">$0</span>
                            <span className="text-[12px] mb-1 text-on-surface-variant">/forever</span>
                          </div>
                          <p className="text-[12px] leading-relaxed text-on-surface-variant">For solo founders trying out the system.</p>
                        </div>
                        <div className="w-full h-px mb-4 bg-black/[0.06]" />
                        <ul className="flex flex-col gap-2.5 flex-1 mb-6">
                          {[
                            { text: "1 user", included: true },
                            { text: "Work management", included: true },
                            { text: "1 bot (WA or Telegram)", included: true },
                            { text: "Invite team members", included: false },
                            { text: "Automation hub", included: false },
                          ].map(f => (
                            <li key={f.text} className={`flex items-center gap-2.5 text-[12px] font-medium ${f.included ? 'text-on-surface' : 'text-on-surface-variant opacity-40'}`}>
                              <Check size={14} className={f.included ? 'text-primary' : 'opacity-0'} />
                              {f.text}
                            </li>
                          ))}
                        </ul>
                        <button className="w-full text-[12px] font-semibold py-2.5 rounded-[6px] border border-black/[0.06] bg-black/[0.02] text-on-surface-variant cursor-not-allowed">
                          Current Plan
                        </button>
                      </div>

                      {/* Pro Plan */}
                      <div className="rounded-[8px] border border-primary/20 bg-primary/[0.02] p-6 flex flex-col relative overflow-hidden shadow-sm">
                        <div className="mb-4">
                          <span className="text-[11px] uppercase tracking-[0.1em] font-bold text-primary">Pro</span>
                          <div className="flex items-end gap-1.5 mt-1 mb-2">
                            <span className="text-[32px] leading-none font-bold tracking-tight text-primary">$29</span>
                            <span className="text-[12px] mb-1 text-primary/60">/per month</span>
                          </div>
                          <p className="text-[12px] leading-relaxed text-on-surface-variant">For teams that need full collaboration and automation.</p>
                        </div>
                        <div className="w-full h-px mb-4 bg-primary/10" />
                        <ul className="flex flex-col gap-2.5 flex-1 mb-6">
                          {[
                            { text: "Multi-user (invite team)", included: true },
                            { text: "Multiple bots (WA + Telegram)", included: true },
                            { text: "Team chat & discussion", included: true },
                            { text: "Automation hub", included: true },
                            { text: "Full activity timeline", included: true },
                          ].map(f => (
                            <li key={f.text} className={`flex items-center gap-2.5 text-[12px] font-medium text-on-surface`}>
                              <Check size={14} className="text-primary" />
                              {f.text}
                            </li>
                          ))}
                        </ul>
                        <button className="w-full text-[12px] font-semibold py-2.5 rounded-[6px] bg-primary text-white hover:bg-primary/90 transition-colors shadow-sm active:scale-95">
                          Upgrade to Pro
                        </button>
                      </div>
                    </div>
                  </section>
                </>
              )}

              {activeTab === "security" && (
                <>
                  <section>
                    <div className="border-b border-black/[0.06] pb-4 mb-6">
                      <h2 className="text-[14px] font-semibold text-on-surface">Account Session</h2>
                    </div>
                    <div className="flex items-center justify-between rounded-[8px] border border-black/[0.12] bg-white p-4">
                      <div className="flex items-center gap-4">
                        <UserAvatar
                          user={{ name: data.user?.name || "User", email: data.user?.email || "", image: data.user?.image || null }}
                          size="md"
                          className="w-12 h-12 flex-shrink-0 border-transparent shadow-sm"
                        />
                        <div className="min-w-0">
                          <p className="text-[14px] font-semibold text-on-surface truncate">{data.user?.name}</p>
                          <p className="text-[12px] text-on-surface-variant truncate">{data.user?.email}</p>
                        </div>
                      </div>
                      <Button variant="secondary" size="sm" icon={LogOut} onClick={handleSignOut}>
                        Sign Out
                      </Button>
                    </div>
                  </section>

                  <section>
                    <div className="border-b border-black/[0.06] pb-4 mb-6">
                      <h2 className="text-[14px] font-semibold text-on-surface">Workspace Permissions</h2>
                    </div>
                    <div>
                      <label className="mb-2 block font-medium text-[13px] text-on-surface">Your Role</label>
                      <div className="h-10 w-full max-w-sm cursor-not-allowed rounded-[6px] border border-black/[0.06] bg-black/[0.02] px-3 flex items-center gap-2">
                        <Shield size={14} className="text-on-surface-variant opacity-60" />
                        <span className="text-[13px] font-semibold capitalize text-on-surface-variant">{data.membership.role}</span>
                      </div>
                    </div>
                  </section>

                  <section>
                    <div className="border-b border-red-500/20 pb-4 mb-6">
                      <h2 className="text-[14px] font-semibold text-red-700">Danger Zone</h2>
                    </div>
                    <div className="space-y-4">
                      <div className="flex items-center justify-between rounded-[8px] border border-red-500/20 bg-red-500/[0.02] p-4">
                        <div>
                          <p className="text-[13px] font-semibold text-on-surface">Leave Workspace</p>
                          <p className="text-[12px] text-on-surface-variant mt-0.5">Remove your membership. Owners can leave only if another owner remains.</p>
                        </div>
                        <Button variant="danger" size="sm" icon={LogOut} isLoading={isLeaving} onClick={() => setIsLeaveModalOpen(true)}>
                          Leave
                        </Button>
                      </div>

                      {isOwner && (
                        <div className="flex items-center justify-between rounded-[8px] border border-red-500/20 bg-red-500/[0.02] p-4">
                          <div>
                            <p className="text-[13px] font-semibold text-on-surface">Delete Workspace</p>
                            <p className="text-[12px] text-on-surface-variant mt-0.5">Permanently delete this workspace and all associated records.</p>
                          </div>
                          <Button variant="danger" size="sm" icon={Trash2} isLoading={isDeleting} onClick={() => setIsDeleteModalOpen(true)}>
                            Delete
                          </Button>
                        </div>
                      )}
                    </div>
                  </section>
                </>
              )}
            </div>
          ) : null}
        </div>
      </div>

      <ConfirmationModal
        isOpen={isRemoveLogoModalOpen}
        onClose={() => setIsRemoveLogoModalOpen(false)}
        onConfirm={() => {
          setForm((current) => ({ ...current, logo: "" }));
          setIsRemoveLogoModalOpen(false);
        }}
        title="Remove logo?"
        description="This will remove your workspace logo. A default placeholder will be shown instead."
        confirmLabel="Remove Logo"
      />

      <ConfirmationModal
        isOpen={isLeaveModalOpen}
        onClose={() => setIsLeaveModalOpen(false)}
        onConfirm={handleLeaveTenant}
        title="Leave workspace?"
        description={`This action removes your access to "${data?.tenant.name}". You will need a new invitation to rejoin.`}
        confirmLabel="Leave Workspace"
        isLoading={isLeaving}
      />

      <ConfirmationModal
        isOpen={isDeleteModalOpen}
        onClose={() => setIsDeleteModalOpen(false)}
        onConfirm={handleDeleteTenant}
        title="Delete workspace?"
        description="This action permanently deletes the workspace, its settings, and all associated records. This action cannot be undone."
        confirmLabel="Delete Workspace"
        isLoading={isDeleting}
      />
    </div>
  );
}

function ReadOnlyMetric({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="space-y-2 min-w-0">
      <p className="font-label-caps text-[9px] text-on-surface-variant opacity-60 uppercase tracking-wider">
        {label}
      </p>
      <p className="font-display text-[14px] font-semibold text-on-surface truncate">
        {value}
      </p>
    </div>
  );
}

function InfoRow({ icon: Icon, label, value }: { icon: React.ElementType; label: string; value: string }) {
  return (
    <div className="flex items-center gap-4 p-5 rounded-xl border border-black/[0.05] bg-black/[0.01]">
      <div className="w-10 h-10 rounded-lg bg-white border border-black/[0.06] flex items-center justify-center text-primary">
        <Icon size={18} />
      </div>
      <div className="min-w-0">
        <p className="font-label-caps text-[9px] text-on-surface-variant opacity-60 uppercase tracking-wider">
          {label}
        </p>
        <p className="font-display text-[14px] font-semibold text-on-surface truncate">
          {value}
        </p>
      </div>
    </div>
  );
}

function DangerAction({
  icon: Icon,
  title,
  description,
  action,
}: {
  icon: React.ElementType;
  title: string;
  description: string;
  action: React.ReactNode;
}) {
  return (
    <div className="flex flex-col sm:flex-row sm:items-center gap-4 justify-between p-5 rounded-xl border border-red-500/10 bg-red-500/[0.025]">
      <div className="flex items-start gap-4 min-w-0">
        <div className="w-10 h-10 rounded-lg bg-white border border-red-500/10 flex items-center justify-center text-red-600 shrink-0">
          <Icon size={18} />
        </div>
        <div className="min-w-0">
          <p className="font-display text-[14px] font-semibold text-on-surface">{title}</p>
          <p className="font-body-sm text-[12px] text-on-surface-variant opacity-65 mt-1 leading-relaxed">
            {description}
          </p>
        </div>
      </div>
      <div className="shrink-0">{action}</div>
    </div>
  );
}
