"use client";
import { useState, useRef, useEffect, KeyboardEvent } from "react";
import {
  AlertCircle, CalendarDays, ChevronDown,
  Plus, Trash2, CheckSquare, Square, Link as LinkIcon,
  Paperclip,
} from "lucide-react";
import type { Task, Priority, Status, ChecklistItem } from "@/features/tasks";
import type { Member, ExternalLink, Attachment } from "@/features/tasks";
import { PRIORITY_META, STATUS_META, ALL_STATUSES, ALL_PRIORITIES } from "@/features/tasks";
import MemberPicker from "@/features/tasks/components/MemberPicker";
import LabelManager from "./LabelManager";
import AttachmentZone from "./AttachmentZone";
import ExternalLinksPanel from "@/features/tasks/components/ExternalLinksPanel";

import { ModalShell } from "@/components/ui/global/modal/ModalShell";
import { ModalHeader } from "@/components/ui/global/modal/ModalHeader";
import { ModalContent } from "@/components/ui/global/modal/ModalContent";
import { ModalFooter } from "@/components/ui/global/modal/ModalFooter";
import { GlobalInput } from "@/components/ui/global/form/GlobalInput";
import { GlobalTextarea } from "@/components/ui/global/form/GlobalTextarea";
import DatePicker from "@/components/ui/DatePicker";
import { useTenant } from "@/components/providers/TenantProvider";
import { getUserDisplayName } from "@/lib/user-identity";

/* ── Reusable click dropdown ─────────────────────────────────────────────── */
function Dd<T extends string>({ value, opts, onChange, renderT, renderO }: {
  value: T; opts: T[]; onChange: (v: T) => void;
  renderT: (v: T) => React.ReactNode; renderO: (v: T) => React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", h); return () => document.removeEventListener("mousedown", h);
  }, [open]);
  return (
    <div ref={ref} className="relative">
      <button onClick={() => setOpen(v => !v)} className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-[6px] hover:bg-black/[0.04] transition-colors" style={{ border: "1px solid rgba(0,0,0,0.09)" }}>
        {renderT(value)}
        <ChevronDown size={10} strokeWidth={2} style={{ color: "var(--color-on-surface-variant)", opacity: 0.5 }} />
      </button>
      {open && (
        <div className="absolute top-full left-0 mt-1 z-50 py-1 rounded-[8px] shadow-xl" style={{ background: "#fff", border: "1px solid rgba(0,0,0,0.1)", minWidth: 155 }}>
          {opts.map(o => (
            <button key={o} onClick={() => { onChange(o); setOpen(false); }} className="w-full flex items-center gap-2 px-3 py-1.5 hover:bg-black/[0.04] text-left transition-colors">
              {renderO(o)}
              {value === o && <span className="ml-auto font-label-caps text-[8px]" style={{ color: "var(--color-on-surface-variant)", opacity: 0.4 }}>✓</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/* ── Section label ───────────────────────────────────────────────────────── */
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

/* ── Props ───────────────────────────────────────────────────────────────── */
interface Props {
  onClose: () => void;
  onCreate: (task: Task) => void;
  nextId: string;
  defaultStatus?: Status;
}

/* ══════════════════════════════════════════════════════════════════════════
   CreateTaskModal
══════════════════════════════════════════════════════════════════════════ */
export default function CreateTaskModal({ onClose, onCreate, nextId, defaultStatus = "Todo" }: Props) {
  const { user } = useTenant();
  const [title,       setTitle]       = useState("");
  const [desc,        setDesc]        = useState("");
  const [priority,    setPriority]    = useState<Priority>("medium");
  const [status,      setStatus]      = useState<Status>(defaultStatus);
  const [due,         setDue]         = useState("");
  const [labels,      setLabels]      = useState<string[]>([]);
  const [assignees,   setAssignees]   = useState<Member[]>([]);
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [links,       setLinks]       = useState<ExternalLink[]>([]);
  const [checklist,   setChecklist]   = useState<ChecklistItem[]>([]);
  const [newCheck,    setNewCheck]    = useState("");

  /* ── Checklist helpers ── */
  function addCheck() {
    const t = newCheck.trim(); if (!t) return;
    setChecklist(p => [...p, { id: `c${Date.now()}`, text: t, done: false }]);
    setNewCheck("");
  }
  function onCheckKD(e: KeyboardEvent<HTMLInputElement>) { if (e.key === "Enter") { e.preventDefault(); addCheck(); } }
  function toggleCheck(id: string) { setChecklist(p => p.map(c => c.id === id ? { ...c, done: !c.done } : c)); }
  function removeCheck(id: string) { setChecklist(p => p.filter(c => c.id !== id)); }

  /* ── Create ── */
  function handleCreate() {
    if (!title.trim()) return;
    const task: Task = {
      id: nextId,
      title: title.trim(),
      description: desc.trim(),
      priority, status,
      assignees,
      labels,
      due: due || null,
      created: new Date().toISOString().split("T")[0],
      checklist,
      externalLinks: links,
      comments: [],
      activity: [{ id: "a1", actorId: user?.id, actor: getUserDisplayName(user, "System"), action: "created this task", timestamp: new Date().toLocaleString() }],
      attachments,
      recurring: "none",
    };
    onCreate(task);
    onClose();
  }

  const doneCount = checklist.filter(c => c.done).length;
  const checkPct  = checklist.length > 0 ? Math.round((doneCount / checklist.length) * 100) : 0;

  const footerSummary = (
    <>
      {labels.slice(0, 3).map(l => (
        <span key={l} className="font-label-caps text-[8px] font-semibold px-1.5 py-0.5 rounded-full" style={{ background: "var(--color-primary)", color: "var(--color-on-primary)" }}>{l}</span>
      ))}
      {checklist.length > 0 && <span className="font-label-caps text-[9px] font-semibold" style={{ color: "var(--color-on-surface-variant)", opacity: 0.45 }}>{checklist.length} item{checklist.length !== 1 ? "s" : ""}</span>}
      {attachments.length > 0 && <span className="font-label-caps text-[9px] font-semibold flex items-center gap-1" style={{ color: "var(--color-on-surface-variant)", opacity: 0.45 }}><Paperclip size={9} strokeWidth={2} />{attachments.length}</span>}
      {links.length > 0 && <span className="font-label-caps text-[9px] font-semibold flex items-center gap-1" style={{ color: "var(--color-on-surface-variant)", opacity: 0.45 }}><LinkIcon size={9} strokeWidth={2} />{links.length}</span>}
    </>
  );

  return (
    <ModalShell onClose={onClose} maxWidth={600}>
      <ModalHeader title="New Task" onClose={onClose} />
      
      <ModalContent className="db-sidebar space-y-6">
        <div className="space-y-4">
          <GlobalInput
            autoFocus
            required
            maxLength={60}
            placeholder="Task title…"
            value={title}
            onChange={e => setTitle(e.target.value)}
            onKeyDown={e => e.key === "Enter" && handleCreate()}
            className="font-display font-semibold"
            style={{ fontSize: "16px", background: "transparent", border: "none", padding: "0" }}
          />

          <GlobalTextarea
            rows={2}
            maxLength={500}
            placeholder="Add a description (optional)…"
            value={desc}
            onChange={e => setDesc(e.target.value)}
          />

          <div className="flex items-center gap-2 flex-wrap pt-2">
            <Dd
              value={status} opts={ALL_STATUSES} onChange={setStatus}
              renderT={s => <><span className="w-1.5 h-1.5 rounded-full" style={{ background: STATUS_META[s].dot }} /><span className="font-label-caps text-[10px] font-semibold" style={{ color: STATUS_META[s].color }}>{s}</span></>}
              renderO={s => <><span className="w-1.5 h-1.5 rounded-full" style={{ background: STATUS_META[s].dot }} /><span className="font-body-md text-[12px]" style={{ color: STATUS_META[s].color }}>{s}</span></>}
            />
            <Dd
              value={priority} opts={ALL_PRIORITIES} onChange={setPriority}
              renderT={p => <><AlertCircle size={11} strokeWidth={2} style={{ color: PRIORITY_META[p].color }} /><span className="font-label-caps text-[10px] font-semibold" style={{ color: PRIORITY_META[p].color }}>{PRIORITY_META[p].label}</span></>}
              renderO={p => <><AlertCircle size={11} strokeWidth={2} style={{ color: PRIORITY_META[p].color }} /><span className="font-body-md text-[12px]" style={{ color: PRIORITY_META[p].color }}>{PRIORITY_META[p].label}</span></>}
            />
            <DatePicker
              variant="compact"
              value={due || null}
              onChange={val => setDue(val || "")}
              placeholder="Set due date"
            />
          </div>
        </div>

        {/* Assignees */}
        <div>
          <SL>Assignees</SL>
          <MemberPicker selected={assignees} onChange={setAssignees} />
        </div>

        {/* Labels */}
        <div>
          <SL>Labels</SL>
          <LabelManager selected={labels} onChange={setLabels} />
        </div>

        <div style={{ height: 1, background: "rgba(0,0,0,0.06)" }} />

        {/* Checklist */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <SL icon={<CheckSquare size={11} strokeWidth={1.75} style={{ color: "var(--color-on-surface-variant)", opacity: 0.38 }} />}>
              Tasks {checklist.length > 0 && `(${doneCount}/${checklist.length})`}
            </SL>
            {checklist.length > 0 && (
              <div className="flex items-center gap-1.5">
                <div className="w-16 h-[3px] rounded-full overflow-hidden" style={{ background: "rgba(0,0,0,0.07)" }}>
                  <div className="h-full rounded-full transition-all" style={{ width: `${checkPct}%`, background: checkPct === 100 ? "rgba(0,120,60,0.7)" : "var(--color-primary)" }} />
                </div>
                <span className="font-label-caps text-[9px] font-semibold" style={{ color: "var(--color-on-surface-variant)", opacity: 0.5 }}>{checkPct}%</span>
              </div>
            )}
          </div>

          {checklist.length > 0 && (
            <div className="space-y-1 mb-2">
              {checklist.map(item => (
                <div key={item.id} className="flex items-center gap-2.5 px-2 py-1.5 rounded-[6px] hover:bg-black/[0.02] group/ci transition-colors">
                  <button onClick={() => toggleCheck(item.id)} className="shrink-0">
                    {item.done
                      ? <CheckSquare size={13} strokeWidth={2} style={{ color: "rgba(0,120,60,0.75)" }} />
                      : <Square size={13} strokeWidth={1.75} style={{ color: "var(--color-on-surface-variant)", opacity: 0.38 }} />
                    }
                  </button>
                  <span className="flex-1 font-body-md text-[12.5px]" style={{ color: item.done ? "var(--color-on-surface-variant)" : "var(--color-on-surface)", opacity: item.done ? 0.45 : 0.85, textDecoration: item.done ? "line-through" : "none" }}>{item.text}</span>
                  <button onClick={() => removeCheck(item.id)} className="opacity-0 group-hover/ci:opacity-100 transition-opacity p-0.5 rounded hover:bg-black/[0.06]">
                    <Trash2 size={11} strokeWidth={1.75} style={{ color: "rgba(186,26,26,0.55)" }} />
                  </button>
                </div>
              ))}
            </div>
          )}

          <div className="flex items-center gap-2 px-2.5 py-1.5 rounded-[6px]" style={{ border: "1px dashed rgba(0,0,0,0.13)", background: "rgba(0,0,0,0.01)" }}>
            <Plus size={11} strokeWidth={1.75} style={{ color: "var(--color-on-surface-variant)", opacity: 0.35, flexShrink: 0 }} />
            <input
              placeholder="Add checklist item… (Enter)"
              value={newCheck}
              onChange={e => setNewCheck(e.target.value)}
              onKeyDown={onCheckKD}
              className="flex-1 bg-transparent outline-none font-body-md text-[12.5px]"
              style={{ color: "var(--color-on-surface)" }}
            />
            {newCheck.trim() && (
              <button onClick={addCheck} className="font-label-caps text-[9px] font-semibold px-2 py-0.5 rounded shrink-0" style={{ background: "rgba(0,0,0,0.07)", color: "var(--color-on-surface-variant)" }}>Add</button>
            )}
          </div>
        </div>


        <div style={{ height: 1, background: "rgba(0,0,0,0.06)" }} />

        {/* External Links */}
        <div>
          <SL icon={<LinkIcon size={11} strokeWidth={1.75} style={{ color: "var(--color-on-surface-variant)", opacity: 0.38 }} />}>
            Links {links.length > 0 && `(${links.length})`}
          </SL>
          <ExternalLinksPanel links={links} onChange={setLinks} />
        </div>

        {/* Attachments */}
        <div>
          <SL icon={<Paperclip size={11} strokeWidth={1.75} style={{ color: "var(--color-on-surface-variant)", opacity: 0.38 }} />}>
            Attachments {attachments.length > 0 && `(${attachments.length})`}
          </SL>
          <AttachmentZone attachments={attachments} onChange={setAttachments} compact />
        </div>
      </ModalContent>

      <ModalFooter summary={footerSummary}>
        <button onClick={onClose} className="font-label-caps text-[10px] uppercase tracking-[0.05em] font-semibold px-3.5 py-2 rounded-[6px] hover:bg-black/[0.05] transition-colors" style={{ color: "var(--color-on-surface-variant)", opacity: 0.65 }}>
          Cancel
        </button>
        <button onClick={handleCreate} disabled={!title.trim()} className="font-label-caps text-[10px] uppercase tracking-[0.05em] font-semibold px-4 py-2 rounded-[6px] disabled:opacity-30 hover:-translate-y-px transition-all" style={{ background: "var(--color-primary)", color: "var(--color-on-primary)" }}>
          Create Task
        </button>
      </ModalFooter>
    </ModalShell>
  );
}
