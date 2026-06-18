"use client";

import { useState, useMemo, useEffect } from "react";
import { Search, Check, X } from "lucide-react";
import { type Member } from "@/features/tasks";
import UserAvatar from "@/components/common/UserAvatar";
import { getUserDisplayName, getUserInitials } from "@/lib/user-identity";

interface Props {
  selected: Member[];
  onChange: (members: Member[]) => void;
  max?: number;
}

interface ApiMember {
  id: string;
  userId: string;
  name: string;
  email: string;
  image: string | null;
  role: string;
  department: string | null;
  position: string | null;
  status: string;
}

export default function MemberPicker({ selected, onChange, max }: Props) {
  const [query,   setQuery]   = useState("");
  const [open,    setOpen]    = useState(false);
  const [members, setMembers] = useState<Member[]>([]);

  useEffect(() => {
    fetch("/api/tenant/members")
      .then((r) => r.json())
      .then((data) => {
        if (data.members) {
          setMembers(
            (data.members as ApiMember[]).map((m) => ({
              id: m.userId,
              name: getUserDisplayName(m, "Member"),
              email: m.email,
              image: m.image,
              initials: getUserInitials(m),
              role: m.role,
            }))
          );
        }
      })
      .catch(() => {/* silently ignore */});
  }, []);

  const filtered = useMemo(() =>
    members.filter((m) =>
      m.name.toLowerCase().includes(query.toLowerCase()) ||
      m.role?.toLowerCase().includes(query.toLowerCase())
    ), [members, query]);

  function toggle(member: Member) {
    const isSelected = selected.some((s) => s.id === member.id || s.name === member.name);
    if (isSelected) {
      onChange(selected.filter((s) => s.id !== member.id));
    } else {
      if (max && selected.length >= max) return;
      onChange([...selected, member]);
    }
  }

  function remove(id: string) {
    onChange(selected.filter((s) => s.id !== id));
  }

  return (
    <div className="space-y-2">
      {/* Selected avatars */}
      {selected.length > 0 && (
        <div className="flex items-center gap-1.5 flex-wrap">
          {selected.map((m) => (
            <div key={m.id} className="group/av relative flex items-center gap-1.5 px-2 py-1 rounded-full" style={{ background: "rgba(0,0,0,0.05)", border: "1px solid rgba(0,0,0,0.08)" }}>
              <UserAvatar user={m} size="xs" />
              <span className="font-body-sm text-[11px] font-medium" style={{ color: "var(--color-on-surface)" }}>{m.name}</span>
              <button onClick={() => remove(m.id)} className="ml-0.5 opacity-50 hover:opacity-100 transition-opacity">
                <X size={9} strokeWidth={2.5} style={{ color: "var(--color-on-surface)" }} />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Toggle button */}
      {(!max || selected.length < max) && (
        <button
          onClick={() => setOpen((v) => !v)}
          className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-[6px] hover:bg-black/[0.04] transition-colors font-label-caps text-[9px] font-semibold uppercase tracking-[0.08em]"
          style={{ border: "1px dashed rgba(0,0,0,0.18)", color: "var(--color-on-surface-variant)", opacity: 0.7 }}
        >
          {selected.length === 0 ? "+ Assign Member" : "+ Add More"}
        </button>
      )}

      {/* Dropdown */}
      {open && (
        <div className="rounded-[10px] overflow-hidden shadow-xl" style={{ background: "#fff", border: "1px solid rgba(0,0,0,0.1)" }}>
          {/* Search */}
          <div className="flex items-center gap-2 px-3 py-2.5 border-b" style={{ borderColor: "rgba(0,0,0,0.07)" }}>
            <Search size={12} strokeWidth={1.75} style={{ color: "var(--color-on-surface-variant)", opacity: 0.45, flexShrink: 0 }} />
            <input
              autoFocus
              placeholder="Search members…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="flex-1 bg-transparent outline-none font-body-md text-[12px]"
              style={{ color: "var(--color-on-surface)" }}
            />
          </div>

          {/* Member list */}
          <div className="max-h-48 overflow-y-auto py-1">
            {members.length === 0 ? (
              <p className="px-4 py-3 font-body-sm text-[11px] text-center" style={{ color: "var(--color-on-surface-variant)", opacity: 0.5 }}>Loading members…</p>
            ) : filtered.length === 0 ? (
              <p className="px-4 py-3 font-body-sm text-[11px] text-center" style={{ color: "var(--color-on-surface-variant)", opacity: 0.5 }}>No members found</p>
            ) : filtered.map((m) => {
              const isSelected = selected.some((s) => s.id === m.id || s.name === m.name);
              return (
                <button
                  key={m.id}
                  onClick={() => toggle(m)}
                  className="w-full flex items-center gap-3 px-3 py-2 hover:bg-black/[0.03] transition-colors text-left"
                >
                  <UserAvatar user={m} size="md" className={isSelected ? "ring-1 ring-black/20" : ""} />
                  <div className="flex-1 min-w-0">
                    <div className="font-body-md text-[12px] font-medium" style={{ color: "var(--color-on-surface)" }}>{m.name}</div>
                    {m.role && <div className="font-body-sm text-[10px]" style={{ color: "var(--color-on-surface-variant)", opacity: 0.55 }}>{m.role}</div>}
                  </div>
                  {isSelected && <Check size={12} strokeWidth={2.5} style={{ color: "var(--color-primary)", flexShrink: 0 }} />}
                </button>
              );
            })}
          </div>

          {/* Footer */}
          <div className="px-3 py-2 border-t flex justify-end" style={{ borderColor: "rgba(0,0,0,0.07)" }}>
            <button onClick={() => setOpen(false)} className="font-label-caps text-[9px] font-semibold px-2.5 py-1 rounded-[5px] hover:bg-black/[0.05] transition-colors uppercase tracking-[0.06em]" style={{ color: "var(--color-on-surface-variant)", opacity: 0.7 }}>
              Done
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
