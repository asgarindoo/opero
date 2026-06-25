"use client";
import { useState, useRef, useEffect } from "react";
import {
  AlertCircle,
  CalendarDays,
  CheckSquare,
  Paperclip,
  Link,
  MessageSquare,
  Trash2,
  Square,
  Clock,
  Target,
  X
} from "lucide-react";
import type { Task, Comment } from "@/features/tasks";
import { getCampaign } from "@/features/campaigns/services/campaigns.client";
import { PRIORITY_META, STATUS_META, ALL_STATUSES, ALL_PRIORITIES } from "@/features/tasks";
import AttachmentZone from "./AttachmentZone";
import LabelManager from "./LabelManager";
import MemberPicker from "@/features/tasks/components/MemberPicker";
import ExternalLinksPanel from "@/features/tasks/components/ExternalLinksPanel";
import ReactionsBar, { toggleReaction } from "@/features/tasks/components/ReactionsBar";

import Drawer from "@/components/ui/Drawer";
import Button from "@/components/ui/Button";
import Dropdown from "@/components/ui/Dropdown";
import Badge from "@/components/ui/Badge";
import Input from "@/components/ui/Input";
import DatePicker from "@/components/ui/DatePicker";
import { useTenant } from "@/components/providers/TenantProvider";
import UserAvatar from "@/components/common/UserAvatar";
import { getUserDisplayName, getUserInitials } from "@/lib/user-identity";
import ConfirmationModal from "@/components/common/ConfirmationModal";

interface Props {
  task: Task;
  allTasks: Task[];
  onClose: () => void;
  onUpdate: (id: string, patch: Partial<Task>) => void;
  onDelete: (id: string) => void;
  canDelete: boolean;
}

function Section({ label, icon, count, children, defaultOpen = true }: { label: string; icon?: React.ReactNode; count?: number; children: React.ReactNode; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="space-y-3">
      <button onClick={() => setOpen(v => !v)} className="flex items-center gap-2 group w-full">
        <span className="font-label-caps text-[10px] font-bold text-on-surface-variant opacity-30 uppercase tracking-[0.15em] flex-1 text-left">
          {label} {count !== undefined && `(${count})`}
        </span>
        <div className="h-px flex-1 bg-black/[0.03]" />
      </button>
      {open && children}
    </div>
  );
}

export default function TaskDrawer({ task, allTasks, onClose, onUpdate, onDelete, canDelete }: Props) {
  const { user } = useTenant();
  const [tab, setTab] = useState<"details" | "activity">("details");
  const [comment, setComment] = useState("");
  const [editTitle, setEditTitle] = useState(false);
  const [titleVal, setTitleVal] = useState(task.title);
  const [campaignName, setCampaignName] = useState<string | null>(null);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [noteToDelete, setNoteToDelete] = useState<string | null>(null);
  const [itemToDelete, setItemToDelete] = useState<string | null>(null);
  const [isDetachModalOpen, setIsDetachModalOpen] = useState(false);

  const done = task.checklist.filter(c => c.done).length;
  const total = task.checklist.length;
  const checkPct = total > 0 ? Math.round((done / total) * 100) : 0;

  useEffect(() => {
    let cancelled = false;

    Promise.resolve().then(() => {
      if (cancelled) return;
      setTitleVal(task.title);
      setEditTitle(false);
    });

    if (task.campaignId) {
      getCampaign<{ name?: string }>(task.campaignId)
        .then((c) => {
          if (!cancelled && c?.name) setCampaignName(c.name);
        })
        .catch(console.error);
    } else {
      setCampaignName(null);
    }

    return () => {
      cancelled = true;
    };
  }, [task.id, task.title, task.campaignId]);

  const handleUpdate = (patch: Partial<Task>, actionDesc?: string, detailDesc?: string) => {
    const actor = getUserDisplayName(user, "System");
    const timestamp = new Date().toLocaleString();

    if (actionDesc) {
      const newActivity = {
        id: `a${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
        actorId: user?.id,
        actor,
        action: actionDesc,
        detail: detailDesc,
        timestamp
      };
      patch.activity = [...task.activity, newActivity];
    }
    onUpdate(task.id, patch);
  };

  function submitComment() {
    if (!comment.trim()) return;
    const author = getUserDisplayName(user, "Current User");
    const c: Comment = {
      id: `c${Date.now()}`,
      userId: user?.id,
      author,
      email: user?.email,
      initials: getUserInitials(user),
      avatar: user?.image,
      body: comment.trim(),
      timestamp: new Date().toLocaleString(),
    };
    handleUpdate({ comments: [...task.comments, c] }, "added a note", comment.trim());
    setComment("");
  }

  function toggleCheck(id: string) {
    const item = task.checklist.find(c => c.id === id);
    const checklist = task.checklist.map(c => c.id === id ? { ...c, done: !c.done } : c);
    handleUpdate({ checklist }, item ? (item.done ? "uncompleted item" : "completed item") : undefined, item?.text);
  }

  function handleCommentReaction(commentId: string, emoji: string) {
    const comments = task.comments.map(c => {
      if (c.id !== commentId) return c;
      return { ...c, reactions: toggleReaction(c.reactions ?? {}, emoji) };
    });
    handleUpdate({ comments });
  }

  const otherTasks = allTasks.filter(t => t.id !== task.id);

  return (
    <Drawer
      isOpen={true}
      onClose={onClose}
      title="Task Details"
      size="md"
    >
      <div className="space-y-8">
        {/* Title */}
        <div className="space-y-2">
          {editTitle ? (
            <Input
              autoFocus
              value={titleVal}
              onChange={e => setTitleVal(e.target.value)}
              onBlur={() => { handleUpdate({ title: titleVal.trim() || task.title }, "changed title to", titleVal.trim()); setEditTitle(false); }}
              onKeyDown={e => {
                if (e.key === "Enter") { handleUpdate({ title: titleVal.trim() || task.title }, "changed title to", titleVal.trim()); setEditTitle(false); }
                if (e.key === "Escape") { setTitleVal(task.title); setEditTitle(false); }
              }}
              className="font-display text-[22px] font-bold p-0 bg-transparent border-none focus:shadow-none focus:bg-transparent h-auto"
            />
          ) : (
            <h1
              onClick={() => setEditTitle(true)}
              className="font-display text-[22px] font-bold text-on-surface tracking-tight cursor-text hover:opacity-70 transition-opacity break-words break-all line-clamp-3"
              title={task.title}
            >
              {task.title}
            </h1>
          )}
          <div className="flex items-center gap-2">
            <Badge variant={task.status === "Done" ? "success" : "warning"}>{task.status}</Badge>
            <Badge variant={task.priority === "high" || task.priority === "urgent" ? "error" : "info"}>{task.priority}</Badge>
          </div>
        </div>

        {/* Quick Meta */}
        <div className="flex flex-col gap-5 py-4 border-y border-black/[0.04] relative z-20">

          <div className="flex items-center gap-2 relative z-30">
            {/* Status dropdown */}
            <div className="space-y-0.5 relative z-30">
              <span className="block font-label-caps text-[8px] font-bold text-on-surface-variant opacity-30 uppercase tracking-widest">Status</span>
              <div className="-ml-2 scale-[0.85] origin-left w-32">
                <Dropdown
                  value={task.status}
                  onChange={(val) => handleUpdate({ status: val as any }, `changed status to ${val}`)}
                  options={ALL_STATUSES.map(s => ({ label: s, value: s }))}
                />
              </div>
            </div>

            {/* Priority dropdown */}
            <div className="space-y-0.5 relative z-20">
              <span className="block font-label-caps text-[8px] font-bold text-on-surface-variant opacity-30 uppercase tracking-widest">Priority</span>
              <div className="-ml-2 scale-[0.85] origin-left w-32">
                <Dropdown
                  value={task.priority}
                  onChange={(val) => handleUpdate({ priority: val as any }, `changed priority to ${val}`)}
                  options={ALL_PRIORITIES.map(p => ({ label: p, value: p }))}
                />
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-x-4 relative z-10 pt-4 border-t border-black/[0.02]">
            <div className="space-y-1.5">
              <span className="block font-label-caps text-[8px] font-bold text-on-surface-variant opacity-30 uppercase tracking-widest">Assignees</span>
              <MemberPicker selected={task.assignees} onChange={a => handleUpdate({ assignees: a }, "updated assignees")} />
            </div>
            <div className="space-y-1.5">
              <span className="block font-label-caps text-[8px] font-bold text-on-surface-variant opacity-30 uppercase tracking-widest">Due Date</span>
              <DatePicker
                value={task.due}
                onChange={date => handleUpdate({ due: date }, "changed due date to", date ? new Date(date).toLocaleDateString() : "None")}
              />
            </div>
          </div>
        </div>

        {/* Campaign Linkage */}
        {task.campaignId && (
          <div className="flex items-center gap-3 group pb-2">
            <span className="font-label-caps text-[10px] font-bold text-on-surface-variant opacity-40 uppercase tracking-[0.15em]">
              Campaign
            </span>
            <span className="w-1 h-1 rounded-full bg-black/[0.1]" />
            <span className="font-display text-[13px] font-medium text-on-surface">
              {campaignName || "Loading..."}
            </span>
            <button
              onClick={() => setIsDetachModalOpen(true)}
              className="group-hover:opacity-100 font-label-caps text-[9px] font-bold uppercase tracking-widest text-on-surface-variant opacity-50 hover:opacity-100 transition-opacity ml-auto"
            >
              Detach
            </button>
          </div>
        )}

        {/* Labels */}
        <Section label="Labels">
          <LabelManager selected={task.labels} onChange={l => handleUpdate({ labels: l }, "updated labels")} />
        </Section>

        {/* Tabs for Details/Activity */}
        <div className="flex gap-6 border-b border-black/[0.04]">
          {(["details", "activity"] as const).map(t => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`pb-3 font-label-caps text-[10px] font-bold uppercase tracking-wider transition-all relative ${tab === t ? 'text-primary' : 'text-on-surface-variant opacity-30 hover:opacity-100'}`}
            >
              {t}
              {tab === t && <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-primary rounded-full animate-fade-in" />}
            </button>
          ))}
        </div>

        {/* Tab Content */}
        <div className="animate-in fade-in duration-300">
          {tab === "details" && (
            <div className="space-y-8">
              <Section label="Description">
                <p className="font-display text-[13.5px] leading-relaxed text-on-surface-variant/80 break-words break-all whitespace-pre-wrap">
                  {task.description || "No description provided."}
                </p>
              </Section>

              <Section label="Checklist" count={total}>
                {total > 0 && (
                  <div className="space-y-3">
                    <div className="flex items-center gap-3 mb-2">
                      <div className="flex-1 h-1.5 bg-black/[0.04] rounded-full overflow-hidden">
                        <div className="h-full bg-primary transition-all duration-500" style={{ width: `${checkPct}%` }} />
                      </div>
                      <span className="font-display text-[11px] font-bold opacity-30">{checkPct}%</span>
                    </div>
                    {task.checklist.map(item => (
                      <div
                        key={item.id}
                        onClick={() => toggleCheck(item.id)}
                        className="flex items-start gap-3 p-2 rounded-[8px] hover:bg-black/[0.02] cursor-pointer transition-all group"
                      >
                        {item.done ? <CheckSquare size={16} className="text-emerald-500 mt-0.5 shrink-0" /> : <Square size={16} className="text-on-surface-variant opacity-20 group-hover:opacity-40 mt-0.5 shrink-0" />}
                        <span className={`font-display text-[13.5px] break-words break-all ${item.done ? 'text-on-surface-variant opacity-40 line-through' : 'text-on-surface'}`}>
                          {item.text}
                        </span>
                        <button
                          onClick={(e) => { e.stopPropagation(); setItemToDelete(item.id); }}
                          className="text-red-500 opacity-20 hover:opacity-100 p-1 rounded transition-all ml-auto"
                          title="Delete item"
                        >
                          <Trash2 size={12} />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </Section>

              <Section label="Links" count={task.externalLinks?.length || 0}>
                <ExternalLinksPanel links={task.externalLinks || []} onChange={l => handleUpdate({ externalLinks: l }, "updated external links")} />
              </Section>

              <Section label="Attachments" count={task.attachments.length}>
                <AttachmentZone attachments={task.attachments} onChange={a => handleUpdate({ attachments: a }, "updated attachments")} />
              </Section>

              <Section label="Notes" count={task.comments.length}>
                <div className="space-y-6">
                  {task.comments.map(c => (
                    <div key={c.id} className="flex gap-4 group">
                      <UserAvatar
                        user={c.userId === user?.id ? user : { name: c.author, email: c.email, image: c.avatar, initials: c.initials }}
                        size="lg"
                      />
                      <div className="flex-1 space-y-1 min-w-0">
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex items-center gap-2">
                            <span className="font-display text-[13px] font-bold">{c.userId === user?.id ? getUserDisplayName(user) : c.author}</span>
                            <span className="text-[10px] text-on-surface-variant opacity-30">{c.timestamp}</span>
                          </div>
                          <button
                            onClick={() => setNoteToDelete(c.id)}
                            className="text-red-500 opacity-20 hover:opacity-100 hover:bg-red-50 p-1 rounded transition-all"
                            title="Delete note"
                          >
                            <Trash2 size={12} />
                          </button>
                        </div>
                        <p className="font-display text-[13px] text-on-surface-variant/80 leading-relaxed break-words break-all whitespace-pre-wrap">{c.body}</p>
                        <ReactionsBar reactions={c.reactions ?? {}} onToggle={e => handleCommentReaction(c.id, e)} />
                      </div>
                    </div>
                  ))}
                  <div className="pt-4 border-t border-black/[0.04]">
                    <div className="flex gap-4">
                      <UserAvatar user={user} size="lg" className="bg-primary text-on-primary" />
                      <div className="flex-1 space-y-2">
                        <textarea
                          rows={2}
                          placeholder="Add a note, update, or log activity..."
                          value={comment}
                          onChange={e => setComment(e.target.value)}
                          onKeyDown={e => {
                            if (e.key === "Enter" && !e.shiftKey) {
                              e.preventDefault();
                              submitComment();
                            }
                          }}
                          className="w-full bg-black/[0.02] border border-black/[0.06] rounded-[8px] p-3 font-display text-[13px] outline-none focus:bg-white focus:border-primary/30 transition-all"
                        />
                        <div className="flex items-center justify-end">
                          <Button
                            variant="primary"
                            size="sm"
                            disabled={!comment.trim()}
                            onClick={submitComment}
                          >
                            POST NOTE
                          </Button>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </Section>

              {canDelete && (
                <div className="pt-8 flex justify-center pb-4">
                  <button
                    onClick={() => setIsDeleteModalOpen(true)}
                    className="font-label-caps text-[10px] font-bold text-red-500 opacity-50 hover:opacity-100 uppercase tracking-widest transition-opacity"
                  >
                    Delete Task
                  </button>
                </div>
              )}
            </div>
          )}

          {tab === "activity" && (
            <div className="space-y-6 relative pl-4">
              <div className="absolute left-[3px] top-2 bottom-2 w-px bg-black/[0.04]" />
              {[...task.activity].reverse().map(a => (
                <div key={a.id} className="relative flex items-start gap-4">
                  <div className="absolute -left-[14px] top-1.5 w-2 h-2 rounded-full bg-black/[0.1] border-2 border-white" />
                  <div className="flex-1 space-y-0.5">
                    <p className="font-display text-[12.5px] text-on-surface-variant/80">
                      <span className="font-bold text-on-surface">{a.actorId === user?.id ? getUserDisplayName(user) : a.actor}</span>
                      {' '}
                      {a.action === 'added a note' ? (
                        <>
                          added a note:{" "}
                          {a.detail && (
                            <span className="whitespace-pre-wrap font-normal opacity-90 text-on-surface">
                              "{a.detail}"
                            </span>
                          )}
                        </>
                      ) : (
                        <>
                          {a.action} {a.detail && <span className="font-bold text-on-surface">{a.detail}</span>}
                        </>
                      )}
                    </p>
                    <div className="flex items-center gap-1.5">
                      <Clock size={10} className="opacity-20" />
                      <span className="text-[10px] text-on-surface-variant opacity-30">{a.timestamp}</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
      
      <ConfirmationModal
        isOpen={isDeleteModalOpen}
        onClose={() => setIsDeleteModalOpen(false)}
        onConfirm={() => {
          if (!canDelete) return;
          onDelete(task.id);
          setIsDeleteModalOpen(false);
          onClose();
        }}
        title="Delete task?"
        description={`This action permanently removes "${task.title}". This action cannot be undone.`}
        confirmLabel="Delete Task"
      />
      
      <ConfirmationModal
        isOpen={!!noteToDelete}
        onClose={() => setNoteToDelete(null)}
        onConfirm={() => {
          if (noteToDelete) {
            handleUpdate({ comments: task.comments.filter(comment => comment.id !== noteToDelete) }, "deleted a note");
            setNoteToDelete(null);
          }
        }}
        title="Delete note?"
        description="This action permanently removes this note. This action cannot be undone."
        confirmLabel="Delete Note"
      />
      
      <ConfirmationModal
        isOpen={!!itemToDelete}
        onClose={() => setItemToDelete(null)}
        onConfirm={() => {
          if (itemToDelete) {
            const item = task.checklist.find(c => c.id === itemToDelete);
            handleUpdate({ checklist: task.checklist.filter(c => c.id !== itemToDelete) }, "deleted checklist item", item?.text);
            setItemToDelete(null);
          }
        }}
        title="Delete checklist item?"
        description="This action permanently removes this item from the task checklist. This action cannot be undone."
        confirmLabel="Delete Item"
      />
      
      <ConfirmationModal
        isOpen={isDetachModalOpen}
        onClose={() => setIsDetachModalOpen(false)}
        onConfirm={() => {
          handleUpdate({ campaignId: null }, "removed from campaign");
          setIsDetachModalOpen(false);
        }}
        title="Remove from campaign?"
        description={`This will detach this task from "${campaignName}".`}
        confirmLabel="Remove"
      />
    </Drawer>
  );
}
