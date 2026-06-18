"use client";

import { useRouter } from "next/navigation";
import { useTenant } from "@/components/providers/TenantProvider";
import { canUse } from "@/lib/client/rbac";
import React, { useMemo, useState } from "react";
import useSWR, { useSWRConfig } from "swr";
import ModuleHeader from "@/components/common/ModuleHeader";
import SearchInput from "@/components/common/SearchInput";
import Button from "@/components/ui/Button";
import { Plus, Globe, Edit2, X, ArrowUpRight } from "lucide-react";
import { useSocialChannels, Channel, ChannelStatus } from "../context/SocialChannelsContext";
import { ModalShell } from "@/components/ui/global/modal/ModalShell";
import { ModalHeader } from "@/components/ui/global/modal/ModalHeader";
import { ModalContent } from "@/components/ui/global/modal/ModalContent";
import { ModalFooter } from "@/components/ui/global/modal/ModalFooter";
import { GlobalInput } from "@/components/ui/global/form/GlobalInput";
import { GlobalTextarea } from "@/components/ui/global/form/GlobalTextarea";
import Dropdown from "@/components/ui/Dropdown";
import UserAvatar from "@/components/common/UserAvatar";
import ConfirmationModal from "@/components/common/ConfirmationModal";
import { createClientId } from "@/lib/client-id";
import { getUserDisplayName } from "@/lib/user-identity";

function SL({ icon, children }: { icon?: React.ReactNode; children: React.ReactNode }) {
   return (
      <div className="flex items-center gap-1.5 mb-2">
         {icon}
         <span className="font-label-caps text-[9px] uppercase tracking-[0.12em] font-semibold" style={{ color: "var(--color-on-surface-variant)", opacity: 0.38 }}>
            {children}
         </span>
      </div>
   );
}

const statusDot = (s: ChannelStatus) =>
   s === "Active" ? "bg-black" : s === "Inactive" ? "bg-black/60" : "bg-black/60";

const statusLabel = (s: ChannelStatus) =>
   s === "Active" ? "bg-black text-white" : "bg-black/[0.05] text-black/100";

const postDot = (s: string) =>
   s === "Ready" ? "bg-black text-white" : s === "Review" ? "bg-black/[0.08] text-black/60" : "bg-black/[0.04] text-black/100";

const PLATFORMS = ["Instagram", "TikTok", "YouTube", "WhatsApp", "Telegram", "Facebook", "X/Twitter", "LinkedIn"];
const STATUSES: ChannelStatus[] = ["Active", "Inactive", "Archived"];

const parseStat = (s: any): number => {
   if (typeof s === 'number') return s;
   if (!s || s === "—") return 0;
   const clean = s.toString().toUpperCase().replace(/[^0-9.KM]/g, '');
   if (clean.endsWith('K')) return parseFloat(clean) * 1000;
   if (clean.endsWith('M')) return parseFloat(clean) * 1000000;
   return parseFloat(clean) || 0;
};

const formatStat = (num: number | undefined) => {
   if (num === undefined || num === 0) return "—";
   if (num >= 1000000) return (num / 1000000).toFixed(1).replace(/\.0$/, '') + 'M';
   if (num >= 1000) return (num / 1000).toFixed(1).replace(/\.0$/, '') + 'K';
   return Math.round(num).toLocaleString();
};

const calculateEngagement = (followers: number, interactions: number) => {
   if (!followers || !interactions) return "0%";
   return ((interactions / followers) * 100).toFixed(1) + "%";
};

type AddForm = Partial<Channel>;

export default function SocialChannelsPage() {
   const { channels, loading, addChannel, updateChannel, removeChannel } = useSocialChannels();
   const [search, setSearch] = useState("");
   const [showAdd, setShowAdd] = useState(false);
   const [editId, setEditId] = useState<string | null>(null);
   const [form, setForm] = useState<AddForm>({});
   const [activeChannel, setActiveChannel] = useState<string | null>(null);
   const [isStatusOpen, setIsStatusOpen] = useState(false);
   const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
   const [channelToDelete, setChannelToDelete] = useState<Channel | null>(null);

   const router = useRouter();
   const { tenant, user, role } = useTenant();
   const canManageChannels = canUse(role, "socialChannels.create");
   const slug = tenant?.slug || "dashboard";
   const activityKey = slug ? `/api/tenant/${slug}/social-channels/activity` : null;
   const { mutate: globalMutate } = useSWRConfig();
   const { data: contentPosts, isLoading: isLoadingContent } = useSWR(`/api/tenant/content-planner`, async (url) => {
      const res = await fetch(url);
      if (!res.ok) return [];
      return res.json();
   }, { fallbackData: [] });

   const { data: activities, isLoading: isLoadingActivities } = useSWR(activityKey, async (url) => {
      const res = await fetch(url);
      if (!res.ok) return [];
      return res.json();
   }, { fallbackData: [], keepPreviousData: true, revalidateOnFocus: false });

   const pushOptimisticActivity = (action: string, channel: string) => {
      if (!activityKey) return;
      const optimisticActivity = {
         id: `pending-${createClientId()}`,
         action,
         channel,
         user: getUserDisplayName(user, "You"),
         userEmail: user?.email ?? undefined,
         userImage: user?.image ?? undefined,
         time: new Date().toISOString(),
      };

      globalMutate(
         activityKey,
         (current: any[] = []) => [optimisticActivity, ...current.filter((item) => item.id !== optimisticActivity.id)].slice(0, 5),
         { revalidate: false }
      );
   };

   const channelNamesById = useMemo(() => new Map(channels.map((channel) => [channel.id, channel.name])), [channels]);

   const SCHEDULED = useMemo(() => (contentPosts || [])
      .filter((p: any) => p.status !== "Published" && p.status !== "Archived")
      .slice(0, 4)
      .map((p: any) => ({
         id: p.id,
         title: p.title,
         status: p.status,
         type: p.type || "Post",
         channel: channelNamesById.get(p.targetAccountId) || "Multiple",
         date: p.date ? p.date.split('T')[0] : "—"
      })), [channelNamesById, contentPosts]);

   const ACTIVITY = useMemo(() => (activities || [])
      .slice(0, 5)
      .map((act: any) => {
         const date = new Date(act.time);
         const isToday = date.toDateString() === new Date().toDateString();
         const timeStr = isToday ? date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : date.toLocaleDateString();
         return {
            ...act,
            time: timeStr
         };
      }), [activities]);

   const filtered = useMemo(() => {
      const normalizedSearch = search.toLowerCase();
      return channels.filter(c =>
         c.name.toLowerCase().includes(normalizedSearch) ||
         c.username.toLowerCase().includes(normalizedSearch) ||
         c.platform.toLowerCase().includes(normalizedSearch)
      );
   }, [channels, search]);

   const openAdd = () => {
      if (!canManageChannels) return;
      setForm({
         status: "Active",
         platform: "",
         followers: 0,
         postsThisMonth: 0,
         interactions: 0,
      });
      setEditId(null);
      setShowAdd(true);
   };
   const openEdit = (ch: Channel) => {
      if (!canManageChannels) return;
      setForm({ ...ch });
      setEditId(ch.id);
      setActiveChannel(ch.id);
      setShowAdd(false);
   };

   const saveChannel = () => {
      if (!canManageChannels) return;
      if (!form.name || !form.platform) return;

      if (editId) {
         const channelId = editId;
         const updates = { ...form };
         const channelName = updates.name || channels.find((channel) => channel.id === channelId)?.name || "Unknown";
         setEditId(null);
         pushOptimisticActivity("Updated Channel", channelName);
         updateChannel(channelId, updates)
            .then(() => {
               if (activityKey) globalMutate(activityKey);
            })
            .catch((err) => console.error("Failed to update social channel:", err));
         return;
      } else {
         const newCh: Channel = {
            id: `ch-${Date.now()}`,
            name: form.name || "",
            platform: form.platform || "Instagram",
            username: form.username || "",
            profileLink: form.profileLink || "",
            status: form.status || "Active",
            followers: form.followers || 0,
            postsThisMonth: form.postsThisMonth || 0,
            interactions: form.interactions || 0,
            monthlyReach: form.monthlyReach,
            averageViews: form.averageViews,
            notes: form.notes || "",
         };
         setShowAdd(false);
         setForm({});
         setEditId(null);
         pushOptimisticActivity("Added Channel", newCh.name);
         addChannel(newCh)
            .then(() => {
               if (activityKey) globalMutate(activityKey);
            })
            .catch((err) => console.error("Failed to create social channel:", err));
      }
   };

   const confirmDelete = () => {
      if (!canManageChannels) return;
      if (!channelToDelete) return;
      const deletedChannel = channelToDelete;
      setIsDeleteModalOpen(false);
      setChannelToDelete(null);
      pushOptimisticActivity("Deleted Channel", deletedChannel.name);
      removeChannel(deletedChannel.id)
         .then(() => {
            if (activityKey) globalMutate(activityKey);
         })
         .catch((err) => console.error("Failed to delete social channel:", err));
   };

   const ic = "w-full bg-[#fcfafa] border border-black/[0.06] rounded-[4px] px-4 py-2.5 font-display text-[12.5px] text-on-surface outline-none focus:border-black/[0.15] focus:bg-white transition-all duration-300 placeholder:text-black/100 appearance-none cursor-pointer";
   const lc = "font-label-caps text-[8.5px] font-bold text-on-surface opacity-80 uppercase tracking-[0.12em] mb-1.5 block transition-opacity";
   const hc = "text-[9.5px] text-on-surface opacity-80 mt-1.5 block leading-relaxed";

   const channelStats = useMemo(() => {
      const totalFollowersNum = channels.reduce((acc, c) => acc + (c.followers || 0), 0);
      const totalInteractionsNum = channels.reduce((acc, c) => acc + (c.interactions || 0), 0);
      const totalPostsNum = channels.reduce((acc, c) => acc + (c.postsThisMonth || 0), 0);
      const totalReachNum = channels.reduce((acc, c) => acc + (c.monthlyReach || 0), 0);
      const activeCount = channels.filter(c => c.status === "Active").length;
      const avgEngagement = totalFollowersNum > 0
         ? ((totalInteractionsNum / totalFollowersNum) * 100).toFixed(1) + "%"
         : "0%";

      return { activeCount, avgEngagement, totalFollowersNum, totalInteractionsNum, totalPostsNum, totalReachNum };
   }, [channels]);

   const { activeCount, avgEngagement, totalFollowersNum, totalInteractionsNum, totalPostsNum, totalReachNum } = channelStats;

   return (
      <div className="flex flex-col h-full bg-[#fdf8f8] overflow-hidden">

         {/* Side Panel */}
         {canManageChannels && showAdd && (
            <ModalShell onClose={() => setShowAdd(false)} maxWidth={640}>
               <ModalHeader title={editId ? "Update Channel" : "New Social Channel"} onClose={() => setShowAdd(false)} />

               <ModalContent className="db-sidebar space-y-6">
                  {/* Identity Section */}
                  <div className="space-y-4">
                     <SL>Identity & Platform</SL>
                     <div className="grid grid-cols-2 gap-4">
                        <div>
                           <GlobalInput
                              maxLength={30}
                              placeholder="Platform (e.g. Instagram)"
                              value={form.platform || ""}
                              onChange={e => setForm(f => ({ ...f, platform: e.target.value }))}
                           />
                        </div>
                        <div>
                           <GlobalInput
                              maxLength={50}
                              placeholder="Account Label (e.g. Opero)"
                              value={form.name || ""}
                              onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                           />
                        </div>
                     </div>

                     <div className="grid grid-cols-2 gap-4">
                        <div>
                           <GlobalInput
                              maxLength={50}
                              placeholder="@username"
                              value={form.username || ""}
                              onChange={e => {
                                 let val = e.target.value;
                                 if (val && !val.startsWith('@')) val = '@' + val;
                                 setForm(f => ({ ...f, username: val }));
                              }}
                           />
                        </div>
                        <div>
                           <GlobalInput
                              maxLength={200}
                              placeholder="Profile Link (https://...)"
                              value={form.profileLink || ""}
                              onChange={e => setForm(f => ({ ...f, profileLink: e.target.value }))}
                           />
                        </div>
                     </div>
                  </div>

                  <div style={{ height: 1, background: "rgba(0,0,0,0.06)" }} />

                  {/* Stats Section */}
                  <div className="space-y-4">
                     <SL>Operational Stats</SL>
                     <div className="grid grid-cols-2 gap-4">
                        <div>
                           <GlobalInput
                              type="number"
                              placeholder="Followers / Subscribers"
                              value={form.followers || ""}
                              onChange={e => setForm(f => ({ ...f, followers: parseInt(e.target.value) || 0 }))}
                           />
                        </div>
                        <div>
                           <GlobalInput
                              type="number"
                              placeholder="Total Interactions"
                              value={form.interactions || ""}
                              onChange={e => setForm(f => ({ ...f, interactions: parseInt(e.target.value) || 0 }))}
                           />
                        </div>
                     </div>

                     <div className="grid grid-cols-2 gap-4">
                        <div>
                           <GlobalInput
                              type="number"
                              placeholder="Total Post"
                              value={form.postsThisMonth || ""}
                              onChange={e => setForm(f => ({ ...f, postsThisMonth: parseInt(e.target.value) || 0 }))}
                           />
                        </div>
                        <div>
                           <GlobalInput
                              type="number"
                              placeholder="Average Views"
                              value={form.averageViews || ""}
                              onChange={e => setForm(f => ({ ...f, averageViews: parseInt(e.target.value) || 0 }))}
                           />
                        </div>
                     </div>
                  </div>

                  <div style={{ height: 1, background: "rgba(0,0,0,0.06)" }} />

                  {/* Configuration Section */}
                  <div className="space-y-4">
                     <SL>Management</SL>
                     <div className="grid grid-cols-2 gap-4">
                        <div className="flex flex-col justify-center col-span-2 md:col-span-1">
                           <Dropdown
                              value={form.status || "Active"}
                              onChange={(val) => setForm(f => ({ ...f, status: val as ChannelStatus }))}
                              options={STATUSES.map(s => ({ value: s, label: s }))}
                           />
                        </div>
                     </div>

                     <div>
                        <GlobalTextarea
                           rows={3}
                           maxLength={500}
                           placeholder="Operational notes, channel purpose, or strategy..."
                           value={form.notes || ""}
                           onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
                        />
                     </div>
                  </div>
               </ModalContent>

               <ModalFooter>
                  <button onClick={() => setShowAdd(false)} className="font-label-caps text-[10px] uppercase tracking-[0.05em] font-semibold px-3.5 py-2 rounded-[6px] hover:bg-black/[0.05] transition-colors" style={{ color: "var(--color-on-surface-variant)", opacity: 0.65 }}>
                     Cancel
                  </button>
                  <button onClick={saveChannel} className="font-label-caps text-[10px] uppercase tracking-[0.05em] font-semibold px-4 py-2 rounded-[6px] hover:-translate-y-px transition-all" style={{ background: "var(--color-primary)", color: "var(--color-on-primary)" }}>
                     {editId ? "Update Channel" : "Create Channel"}
                  </button>
               </ModalFooter>
            </ModalShell>
         )}

         {/* Header */}
         <ModuleHeader
            title="Social Channels"
            count={channels.length}
            leftContent={(
               <div className="flex items-center gap-2">
                  <div className="w-1.5 h-1.5 rounded-full bg-black/60" />
                  <span className="font-label-caps text-[9px] font-bold text-on-surface-variant opacity-80 uppercase tracking-widest">Active:</span>
                  <span className="font-display text-[14px] font-bold text-on-surface">{activeCount}</span>
               </div>
            )}
            rightContent={(
               <>
                  <SearchInput value={search} onChange={setSearch} placeholder="Search channels..." width={180} />
                  {canManageChannels && <Button variant="primary" size="sm" icon={Plus} onClick={openAdd}>ADD CHANNEL</Button>}
               </>
            )}
         />

         {/* Main */}
         <main className="flex-1 overflow-y-auto bg-[#fdf8f8]">
            <div className="max-w-[1440px] mx-auto px-10 pt-10 pb-16 space-y-14">

               {/* High-Fidelity Performance Snapshot */}
               <div className="bg-black rounded-[8px] p-10 border border-white/[0.12] shadow-2xl shadow-black/10 relative overflow-hidden group">
                  {/* Subtle Background Glow */}
                  <div className="absolute -right-20 -top-20 w-64 h-64 bg-white/[0.05] rounded-full blur-[80px] group-hover:bg-white/[0.08] transition-colors duration-700" />

                  <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-10">
                     <div className="space-y-2">
                        <div className="flex items-center gap-3">
                           <p className="font-label-caps text-[9px] font-bold text-white/60 uppercase tracking-[0.2em]">Operational Overview</p>
                        </div>
                        <h2 className="font-display text-[32px] font-bold text-white tracking-tighter leading-none">
                           {formatStat(totalInteractionsNum)} <span className="text-white/60 font-medium ml-1">Audience Interactions</span>
                        </h2>
                        <p className="font-body-sm text-[12px] text-white/60 max-w-md leading-relaxed">
                           Tracking content activity and communication updates across <span className="text-white/90 font-bold">{channels.length} connected platforms</span>. Centralized visibility for publishing performance.
                        </p>
                     </div>

                     <div className="flex items-center gap-12 shrink-0">
                        {[
                           { label: "Managed Channels", value: channels.length, trend: "Total Channel" },
                           { label: "Content Published", value: formatStat(totalPostsNum), trend: "Total Post" },
                           { label: "Global Audience", value: formatStat(totalFollowersNum), trend: "Total reach" },
                        ].map((s, i) => (
                           <div key={i} className="space-y-1">
                              <p className="font-label-caps text-[8px] font-bold text-white/60 uppercase tracking-widest">{s.label}</p>
                              <p className="font-display text-[20px] font-bold text-white tracking-tight">{s.value}</p>
                              <p className="font-display text-[8px] font-bold text-white/60 uppercase tracking-widest">{s.trend}</p>
                           </div>
                        ))}
                     </div>
                  </div>
               </div>

               {/* Main Two-Column Layout */}
               <div className="grid grid-cols-1 xl:grid-cols-[1fr_340px] gap-10">

                  {/* Left: Channels */}
                  <div className="space-y-8">
                     <div className="flex items-center justify-between">
                        <h2 className="font-display text-[13px] font-bold text-on-surface tracking-tight">Managed Channels</h2>
                        <span className="font-label-caps text-[8px] font-bold text-on-surface-variant opacity-60 uppercase tracking-widest">{filtered.length} units</span>
                     </div>

                     <div className="space-y-3">
                        {loading ? (
                           [...Array(3)].map((_, i) => (
                              <div key={i} className="bg-white border border-black/[0.06] rounded-[8px] px-7 py-5 flex items-center gap-5 overflow-hidden animate-pulse">
                                 <div className="min-w-0 flex-1 space-y-2">
                                    <div className="flex items-center gap-3">
                                       <div className="h-4 w-32 bg-black/[0.04] rounded" />
                                       <div className="h-3 w-16 bg-black/[0.04] rounded" />
                                    </div>
                                    <div className="h-3 w-24 bg-black/[0.04] rounded" />
                                 </div>
                                 <div className="hidden md:flex items-center gap-10 shrink-0">
                                    <div className="text-right space-y-2">
                                       <div className="h-3 w-16 bg-black/[0.04] rounded ml-auto" />
                                       <div className="h-4 w-12 bg-black/[0.04] rounded ml-auto" />
                                    </div>
                                    <div className="text-right space-y-2">
                                       <div className="h-3 w-16 bg-black/[0.04] rounded ml-auto" />
                                       <div className="h-4 w-12 bg-black/[0.04] rounded ml-auto" />
                                    </div>
                                    <div className="text-right space-y-2">
                                       <div className="h-3 w-16 bg-black/[0.04] rounded ml-auto" />
                                       <div className="h-4 w-12 bg-black/[0.04] rounded ml-auto" />
                                    </div>
                                 </div>
                                 <div className="flex items-center gap-4 shrink-0 ml-4">
                                    <div className="h-6 w-16 rounded bg-black/[0.04]" />
                                 </div>
                              </div>
                           ))
                        ) : filtered.map(ch => (
                           <div
                              key={ch.id}
                              onClick={() => setActiveChannel(activeChannel === ch.id ? null : ch.id)}
                              className={`group bg-white border rounded-[8px] transition-all cursor-pointer overflow-hidden ${activeChannel === ch.id ? "border-black/20 shadow-sm" : "border-black/[0.06] hover:border-black/15"}`}
                           >
                              {/* Row */}
                              <div className="flex items-center px-7 py-5 gap-5">
                                 {/* Name & Handle */}
                                 <div className="min-w-0 flex-1">
                                    <div className="flex items-center gap-3 mb-0.5">
                                       <h4 className="font-display text-[15px] font-bold text-on-surface tracking-tight leading-none">{ch.name}</h4>
                                       <span className="font-label-caps text-[7.5px] font-bold text-on-surface-variant opacity-80 uppercase tracking-widest">{ch.platform}</span>
                                    </div>
                                    <p className="font-body-sm text-[11.5px] text-on-surface-variant opacity-50">{ch.username || "—"}</p>
                                 </div>

                                 {/* Contextual Platform stats */}
                                 <div className="hidden md:flex items-center gap-10 shrink-0">
                                    {ch.platform.toLowerCase().includes("whatsapp") || ch.platform.toLowerCase().includes("telegram") ? (
                                       <>
                                          <div className="text-right">
                                             <p className="font-label-caps text-[7.5px] font-bold text-on-surface-variant opacity-60 uppercase tracking-widest mb-1">Members</p>
                                             <p className="font-display text-[13.5px] font-bold text-on-surface">{formatStat(ch.followers)}</p>
                                          </div>
                                          <div className="text-right">
                                             <p className="font-label-caps text-[7.5px] font-bold text-on-surface-variant opacity-60 uppercase tracking-widest mb-1">Broadcast Status</p>
                                             <p className="font-display text-[13.5px] font-bold text-on-surface">{ch.status === "Active" ? "Connected" : "Inactive"}</p>
                                          </div>
                                       </>
                                    ) : ch.platform.toLowerCase().includes("newsletter") || ch.platform.toLowerCase().includes("email") ? (
                                       <>
                                          <div className="text-right">
                                             <p className="font-label-caps text-[7.5px] font-bold text-on-surface-variant opacity-60 uppercase tracking-widest mb-1">Subscribers</p>
                                             <p className="font-display text-[13.5px] font-bold text-on-surface">{formatStat(ch.followers)}</p>
                                          </div>
                                          <div className="text-right">
                                             <p className="font-label-caps text-[7.5px] font-bold text-on-surface-variant opacity-60 uppercase tracking-widest mb-1">Reach</p>
                                             <p className="font-display text-[13.5px] font-bold text-on-surface">{formatStat(ch.monthlyReach ?? 0)}</p>
                                          </div>
                                       </>
                                    ) : (
                                       <>
                                          <div className="text-right">
                                             <p className="font-label-caps text-[7.5px] font-bold text-on-surface-variant opacity-60 uppercase tracking-widest mb-1">Followers</p>
                                             <p className="font-display text-[13.5px] font-bold text-on-surface">{formatStat(ch.followers)}</p>
                                          </div>
                                          <div className="text-right">
                                             <p className="font-label-caps text-[7.5px] font-bold text-on-surface-variant opacity-60 uppercase tracking-widest mb-1">{ch.platform.toLowerCase().includes("linkedin") ? "Updates" : "Posts"}</p>
                                             <p className="font-display text-[13.5px] font-bold text-on-surface">{ch.postsThisMonth}</p>
                                          </div>
                                          <div className="text-right">
                                             <p className="font-label-caps text-[7.5px] font-bold text-on-surface-variant opacity-60 uppercase tracking-widest mb-1">Reactions</p>
                                             <p className="font-display text-[13.5px] font-bold text-on-surface">{formatStat(ch.interactions)}</p>
                                          </div>
                                       </>
                                    )}
                                 </div>

                                 {/* actions */}
                                 <div className="flex items-center gap-4 shrink-0 ml-4">
                                    {canManageChannels && <div className="flex items-center gap-1">
                                       <button
                                          onClick={(e) => { e.stopPropagation(); openEdit(ch); }}
                                          className="h-7 w-7 flex items-center justify-center text-on-surface-variant opacity-70 hover:opacity-100 hover:text-on-surface transition-colors rounded-[5px] bg-black/[0.025] hover:bg-black/[0.06]"
                                          title="Edit channel"
                                       >
                                          <Edit2 size={12} />
                                       </button>
                                       <button
                                          onClick={(e) => { e.stopPropagation(); setChannelToDelete(ch); setIsDeleteModalOpen(true); }}
                                          className="h-7 w-7 flex items-center justify-center text-red-500/70 hover:text-red-600 transition-colors rounded-[5px] bg-red-50/60 hover:bg-red-50"
                                          title="Delete channel"
                                       >
                                          <X size={12} />
                                       </button>
                                    </div>}
                                 </div>
                              </div>

                              {/* Expanded Detail */}
                              {activeChannel === ch.id && (
                                 <div onClick={(e) => e.stopPropagation()} className="border-t border-black/[0.04] bg-[#fdf8f8]/60 px-7 py-6">
                                    {editId === ch.id ? (
                                       <div className="space-y-6">
                                          <div className="space-y-4">
                                             <SL>Identity & Platform</SL>
                                             <div className="grid grid-cols-2 gap-4">
                                                <GlobalInput placeholder="Platform (e.g. Instagram)" value={form.platform || ""} onChange={e => setForm(f => ({ ...f, platform: e.target.value }))} />
                                                <GlobalInput placeholder="Account Label" value={form.name || ""} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
                                             </div>
                                             <div className="grid grid-cols-2 gap-4">
                                                <GlobalInput placeholder="@username" value={form.username || ""} onChange={e => {
                                                   let val = e.target.value;
                                                   if (val && !val.startsWith('@')) val = '@' + val;
                                                   setForm(f => ({ ...f, username: val }));
                                                }} />
                                                <GlobalInput placeholder="Profile Link" value={form.profileLink || ""} onChange={e => setForm(f => ({ ...f, profileLink: e.target.value }))} />
                                             </div>
                                          </div>

                                          <div className="space-y-4">
                                             <SL>Operational Stats</SL>
                                             <div className="grid grid-cols-2 gap-4">
                                                <Dropdown value={form.status || "Active"} onChange={(val) => setForm(f => ({ ...f, status: val as ChannelStatus }))} options={STATUSES.map(s => ({ value: s, label: s }))} />
                                                <GlobalInput type="number" placeholder="Total Post" value={form.postsThisMonth || ""} onChange={e => setForm(f => ({ ...f, postsThisMonth: parseInt(e.target.value) || 0 }))} />
                                             </div>
                                             <div className="grid grid-cols-2 gap-4">
                                                <GlobalInput type="number" placeholder="Followers" value={form.followers || ""} onChange={e => setForm(f => ({ ...f, followers: parseInt(e.target.value) || 0 }))} />
                                                <GlobalInput type="number" placeholder="Interactions" value={form.interactions || ""} onChange={e => setForm(f => ({ ...f, interactions: parseInt(e.target.value) || 0 }))} />
                                             </div>
                                          </div>

                                          <div className="space-y-4">
                                             <SL>Additional Context</SL>
                                             <textarea className={ic + " min-h-[80px] resize-none"} placeholder="Internal notes or strategy..." value={form.notes || ""} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} />
                                          </div>

                                          <div className="flex gap-2 justify-end pt-2">
                                             <button onClick={() => setEditId(null)} className="px-4 py-1.5 rounded-[6px] font-label-caps text-[10px] font-bold uppercase tracking-widest text-black/60 hover:bg-black/5 transition-colors">Cancel</button>
                                             <button onClick={saveChannel} className="px-4 py-1.5 rounded-[6px] font-label-caps text-[10px] font-bold uppercase tracking-widest bg-black text-white hover:bg-black/80 transition-colors">Save Changes</button>
                                          </div>
                                       </div>
                                    ) : (
                                       <div className="grid grid-cols-1 md:grid-cols-[1fr_auto] gap-6 items-start">
                                          <div className="space-y-3">
                                             {ch.notes && <p className="font-body-sm text-[12.5px] text-on-surface opacity-60 leading-relaxed">{ch.notes}</p>}
                                             <div className="flex items-center gap-4 pt-1">
                                                <span className={`px-2 py-0.5 rounded-[4px] font-label-caps text-[8.5px] font-bold uppercase tracking-widest ${statusLabel(ch.status)}`}>{ch.status}</span>
                                                <span className="font-label-caps text-[8.5px] font-bold text-on-surface-variant opacity-80 uppercase tracking-widest">{ch.postsThisMonth} Total Post</span>
                                             </div>
                                          </div>
                                          <div className="flex items-center gap-3">
                                             {ch.profileLink && (
                                                <a href={ch.profileLink} target="_blank" rel="noreferrer" className="flex items-center gap-1.5 font-label-caps text-[9px] font-bold text-black/100 hover:text-black transition-colors uppercase tracking-widest">
                                                   <Globe size={12} /> Open <ArrowUpRight size={10} />
                                                </a>
                                             )}
                                          </div>
                                       </div>
                                    )}
                                 </div>
                              )}
                           </div>
                        ))}

                        {/* Ghost Add */}
                        {canManageChannels && <button onClick={openAdd} className="w-full border border-dashed border-black/[0.07] rounded-[8px] py-6 flex items-center justify-center gap-3 group hover:border-black/15 transition-all bg-white/30">
                           <div className="w-6 h-6 rounded-full border border-dashed border-black/15 flex items-center justify-center group-hover:scale-110 transition-transform">
                              <Plus size={12} className="text-black/60 group-hover:text-black" />
                           </div>
                           <span className="font-label-caps text-[9px] font-bold text-black/60 group-hover:text-black/80 uppercase tracking-[0.2em]">Add Channel</span>
                        </button>}
                     </div>
                  </div>

                  {/* Right: Sidebar */}
                  <div className="space-y-2">

                     {/* Upcoming Content */}
                     <div className="space-y-4">
                        <div className="flex items-center justify-between">
                           <h2 className="font-display text-[13px] font-bold text-on-surface tracking-tight">Upcoming Content</h2>
                           <span className="font-label-caps text-[8px] font-normal text-on-surface-variant opacity-60 uppercase tracking-widest">{SCHEDULED.length} items</span>
                        </div>

                        <div className="space-y-2">
                           {isLoadingContent ? (
                              [...Array(3)].map((_, i) => (
                                 <div key={i} className="bg-white border border-black/[0.06] rounded-[8px] px-5 py-4 animate-pulse shadow-[0_1px_2px_rgba(0,0,0,0.02)]">
                                    <div className="flex items-start justify-between gap-3 mb-2.5">
                                       <div className="h-3 w-3/4 bg-black/[0.04] rounded" />
                                       <div className="h-3 w-12 bg-black/[0.04] rounded shrink-0" />
                                    </div>
                                    <div className="flex items-center gap-2">
                                       <div className="h-2 w-16 bg-black/[0.04] rounded" />
                                       <div className="w-0.5 h-0.5 rounded-full bg-black/10 shrink-0" />
                                       <div className="h-2 w-16 bg-black/[0.04] rounded" />
                                    </div>
                                 </div>
                              ))
                           ) : SCHEDULED.length > 0 ? SCHEDULED.map((post: any) => (
                              <div key={post.id} className="bg-white border border-black/[0.06] rounded-[8px] px-5 py-4 group hover:border-black/15 transition-all shadow-[0_1px_2px_rgba(0,0,0,0.02)]">
                                 <div className="flex items-start justify-between gap-3 mb-2.5">
                                    <h4 className="font-display text-[12.5px] font-medium text-on-surface tracking-tight leading-snug line-clamp-2">{post.title}</h4>
                                    <span className={`px-1.5 py-0.5 rounded-[4px] font-label-caps text-[7.5px] font-semibold uppercase tracking-widest shrink-0 ${postDot(post.status)}`}>{post.status}</span>
                                 </div>
                                 <div className="flex items-center gap-2">
                                    {(post as any).channel !== "Multiple" && (
                                       <>
                                          <span className="font-label-caps text-[7.5px] font-semibold text-on-surface-variant opacity-80 uppercase tracking-widest truncate">{post.channel}</span>
                                          <div className="w-0.5 h-0.5 rounded-full bg-black/10 shrink-0" />
                                       </>
                                    )}
                                    <span className="font-body-sm text-[10.5px] text-on-surface-variant opacity-80">{post.date}</span>
                                 </div>
                              </div>
                           )) : (
                              <div className="py-10 px-6 border border-dashed border-black/[0.08] rounded-[8px] bg-black/[0.01] text-center">
                                 <p className="font-body-sm text-[11px] text-on-surface-variant opacity-80 leading-relaxed">No upcoming content scheduled yet. Planned posts and campaigns will appear here.</p>
                              </div>
                           )}
                        </div>
                        <button onClick={() => router.push("/content-planner")} className="w-full py-2.5 font-label-caps text-[8px] font-bold text-on-surface-variant opacity-60 hover:opacity-100 uppercase tracking-widest transition-opacity text-center">Open Content Planner →</button>
                     </div>

                     {/* Recent Activity */}
                     <div className="space-y-4">
                        <div className="flex items-center justify-between">
                           <h2 className="font-display text-[13px] font-bold text-on-surface tracking-tight">Recent Activity</h2>
                        </div>

                        <div className="space-y-px bg-white border border-black/[0.06] rounded-[8px] overflow-hidden divide-y divide-black/[0.03] shadow-[0_1px_2px_rgba(0,0,0,0.02)]">
                           {isLoadingActivities ? (
                              [...Array(4)].map((_, i) => (
                                 <div key={i} className="relative px-5 py-4 flex items-start gap-3 animate-pulse">
                                    <div className="flex-1 min-w-0">
                                       <div className="flex items-start justify-between gap-3 mb-1">
                                          <div className="h-3 w-3/4 bg-black/[0.04] rounded" />
                                          <div className="h-2 w-10 bg-black/[0.04] rounded shrink-0 mt-0.5" />
                                       </div>
                                       <div className="flex flex-wrap items-center gap-1.5 mt-2">
                                          <div className="h-3 w-16 bg-black/[0.04] rounded" />
                                          <div className="w-1 h-1 rounded-full bg-black/10 mx-1" />
                                          <div className="h-2 w-20 bg-black/[0.04] rounded" />
                                       </div>
                                    </div>
                                 </div>
                              ))
                           ) : ACTIVITY.slice(0, 5).length > 0 ? ACTIVITY.slice(0, 5).map((act: any) => (
                              <div key={act.id} className="relative px-5 py-4 group hover:bg-black/[0.01] transition-colors flex items-start gap-3">
                                 <UserAvatar user={{ name: act.user, email: act.userEmail, image: act.userImage }} size="md" />
                                 <div className="flex-1 min-w-0">
                                    <div className="flex items-start justify-between gap-3 mb-1">
                                       <h4 className="font-display text-[12px] font-medium text-on-surface tracking-tight leading-snug">{act.action}</h4>
                                       <span className="font-label-caps text-[7.5px] font-semibold text-on-surface-variant opacity-60 uppercase tracking-widest shrink-0 mt-0.5">{act.time}</span>
                                    </div>
                                    <div className="flex flex-wrap items-center gap-1.5 mt-1">
                                       <span className="font-label-caps text-[7.5px] font-semibold text-black/60 bg-black/[0.04] px-1.5 py-0.5 rounded-[4px] uppercase tracking-widest truncate max-w-[120px]">{act.channel}</span>
                                       <div className="w-1 h-1 rounded-full bg-black/10 mx-1" />
                                       <span className="font-body-sm text-[10px] text-on-surface-variant opacity-80">by <span className="font-medium text-black/80">{act.user}</span></span>
                                    </div>
                                 </div>
                              </div>
                           )) : (
                              <div className="py-12 px-6 text-center">
                                 <p className="font-body-sm text-[11px] text-on-surface-variant opacity-80 leading-relaxed">No recent channel activity yet. Updates will appear here when channels are added, edited, or linked to campaigns.</p>
                              </div>
                           )}
                        </div>
                     </div>

                  </div>
               </div>
            </div>
         </main>

         <ConfirmationModal
            isOpen={isDeleteModalOpen}
            onClose={() => {
               setIsDeleteModalOpen(false);
               setChannelToDelete(null);
            }}
            onConfirm={confirmDelete}
            title="Disconnect channel?"
            description={`This action permanently disconnects the ${channelToDelete?.platform} account and removes its analytics history.`}
            confirmLabel="Disconnect"
         />
      </div>
   );
}
