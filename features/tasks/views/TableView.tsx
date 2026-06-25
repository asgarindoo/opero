"use client";

import { useState, useMemo } from "react";
import { ChevronUp, ChevronDown } from "lucide-react";
import type { Task, Status, Priority } from "@/features/tasks";
import { STATUS_META, PRIORITY_META } from "@/features/tasks";
import UserAvatar from "@/components/common/UserAvatar";

type SortKey = "id" | "title" | "status" | "priority" | "due" | "created";
type SortDir = "asc" | "desc";

interface Props {
  tasks: Task[];
  onTaskClick: (task: Task) => void;
  onStatusChange: (id: string, status: Status) => void;
}

const PRIORITY_ORDER: Record<Priority, number> = { urgent: 0, high: 1, medium: 2, low: 3 };
const STATUS_ORDER:   Record<Status,   number> = { "Backlog": 0, "Todo": 1, "In Progress": 2, "In Review": 3, "Done": 4, "Cancelled": 5 };

function SortHeader({ label, sortKey, active, dir, onSort }: { label: string; sortKey: SortKey; active: SortKey; dir: SortDir; onSort: (k: SortKey) => void }) {
  const isActive = active === sortKey;
  return (
    <th className="px-3 py-2.5 text-left cursor-pointer select-none hover:bg-black/[0.02] transition-colors" onClick={() => onSort(sortKey)}>
      <div className="flex items-center gap-1">
        <span className="font-label-caps text-[9px] font-semibold uppercase tracking-[0.1em]" style={{ color: "var(--color-on-surface-variant)", opacity: isActive ? 0.8 : 0.5 }}>{label}</span>
        {isActive ? (dir === "asc" ? <ChevronUp size={10} strokeWidth={2} style={{ color: "var(--color-on-surface-variant)" }} /> : <ChevronDown size={10} strokeWidth={2} style={{ color: "var(--color-on-surface-variant)" }} />) : null}
      </div>
    </th>
  );
}

export default function TableView({ tasks, onTaskClick, onStatusChange }: Props) {
  const [sortKey, setSortKey] = useState<SortKey>("id");
  const [sortDir, setSortDir] = useState<SortDir>("asc");
  const [page, setPage]       = useState(1);
  const PAGE_SIZE = 25;

  function handleSort(key: SortKey) {
    if (sortKey === key) setSortDir(d => d === "asc" ? "desc" : "asc");
    else { setSortKey(key); setSortDir("asc"); }
    setPage(1);
  }

  const sorted = useMemo(() => {
    const copy = [...tasks];
    copy.sort((a, b) => {
      let cmp = 0;
      if (sortKey === "id")       cmp = a.id.localeCompare(b.id);
      if (sortKey === "title")    cmp = a.title.localeCompare(b.title);
      if (sortKey === "status")   cmp = STATUS_ORDER[a.status]   - STATUS_ORDER[b.status];
      if (sortKey === "priority") cmp = PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority];
      if (sortKey === "due")      cmp = (a.due ?? "9").localeCompare(b.due ?? "9");
      if (sortKey === "created")  cmp = a.created.localeCompare(b.created);
      return sortDir === "asc" ? cmp : -cmp;
    });
    return copy;
  }, [tasks, sortKey, sortDir]);

  const totalPages = Math.ceil(sorted.length / PAGE_SIZE);
  const paged = sorted.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      <div className="flex-1 overflow-auto">
        <table className="w-full border-collapse" style={{ minWidth: 700 }}>
          <thead className="sticky top-0 z-10 bg-[#fef8f8]">
            <tr style={{ background: "rgba(0,0,0,0.025)", borderBottom: "1px solid rgba(0,0,0,0.07)" }}>
              <SortHeader label="Title"    sortKey="title"    active={sortKey} dir={sortDir} onSort={handleSort} />
              <SortHeader label="Status"   sortKey="status"   active={sortKey} dir={sortDir} onSort={handleSort} />
              <SortHeader label="Priority" sortKey="priority" active={sortKey} dir={sortDir} onSort={handleSort} />
              <th className="px-3 py-2.5 text-left"><span className="font-label-caps text-[9px] font-semibold uppercase tracking-[0.1em]" style={{ color: "var(--color-on-surface-variant)", opacity: 0.5 }}>Assignees</span></th>
              <SortHeader label="Due"      sortKey="due"      active={sortKey} dir={sortDir} onSort={handleSort} />
              <th className="px-3 py-2.5 text-left"><span className="font-label-caps text-[9px] font-semibold uppercase tracking-[0.1em]" style={{ color: "var(--color-on-surface-variant)", opacity: 0.5 }}>Labels</span></th>

            </tr>
          </thead>
          <tbody>
            {paged.map((task, i) => {
              const pm = PRIORITY_META[task.priority] || { label: task.priority || "None", bg: "rgba(0,0,0,0.05)", color: "rgba(0,0,0,0.6)" };
              const sm = STATUS_META[task.status] || { dot: "rgba(0,0,0,0.3)", color: "rgba(0,0,0,0.38)", bg: "rgba(0,0,0,0.04)" };
              return (
                <tr
                  key={task.id}
                  onClick={() => onTaskClick(task)}
                  className="cursor-pointer hover:bg-black/[0.02] transition-colors border-b"
                  style={{ borderColor: "rgba(0,0,0,0.04)", background: i % 2 === 0 ? "transparent" : "rgba(0,0,0,0.008)" }}
                >
                  <td className="px-3 py-2.5 max-w-[300px]">
                    <span className="font-body-md text-[12.5px] font-medium line-clamp-1" style={{ color: "var(--color-on-surface)", opacity: 0.9 }}>{task.title}</span>
                  </td>
                  <td className="px-3 py-2.5">
                    <div className="flex items-center gap-1.5">
                      <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: sm.dot }} />
                      <span className="font-label-caps text-[9px] font-semibold" style={{ color: sm.color }}>{task.status}</span>
                    </div>
                  </td>
                  <td className="px-3 py-2.5">
                    <span className="font-label-caps text-[9px] font-semibold px-1.5 py-0.5 rounded" style={{ background: pm.bg, color: pm.color }}>{pm.label}</span>
                  </td>
                  <td className="px-3 py-2.5">
                    <div className="flex -space-x-1">
                      {task.assignees.slice(0, 3).map(a => (
                        <UserAvatar key={a.id} user={a} size="sm" className="h-[18px] w-[18px] border-white" />
                      ))}
                      {task.assignees.length > 3 && <span className="font-label-caps text-[8px]" style={{ color: "var(--color-on-surface-variant)", opacity: 0.5 }}>+{task.assignees.length - 3}</span>}
                    </div>
                  </td>
                  <td className="px-3 py-2.5">
                    {task.due ? <span className="font-label-caps text-[9px] font-semibold" style={{ color: "var(--color-on-surface-variant)", opacity: 0.6 }}>{new Date(task.due).toLocaleDateString("en-US", { month: "short", day: "numeric" })}</span> : <span style={{ opacity: 0.25 }}>—</span>}
                  </td>
                  <td className="px-3 py-2.5">
                    <div className="flex gap-1 flex-wrap">
                      {task.labels.slice(0, 2).map(l => <span key={l} className="font-label-caps text-[8px] font-semibold px-1.5 py-0.5 rounded-full" style={{ background: "rgba(0,0,0,0.05)", color: "var(--color-on-surface-variant)" }}>{l}</span>)}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between px-4 py-2.5 border-t shrink-0" style={{ borderColor: "rgba(0,0,0,0.07)" }}>
          <span className="font-body-sm text-[11px]" style={{ color: "var(--color-on-surface-variant)", opacity: 0.5 }}>
            {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, sorted.length)} of {sorted.length}
          </span>
          <div className="flex items-center gap-1">
            <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1} className="px-2 py-1 rounded-[5px] font-label-caps text-[9px] font-semibold hover:bg-black/[0.05] disabled:opacity-30 transition-colors" style={{ color: "var(--color-on-surface-variant)" }}>← Prev</button>
            <span className="font-label-caps text-[9px] font-semibold px-2" style={{ color: "var(--color-on-surface-variant)", opacity: 0.6 }}>{page}/{totalPages}</span>
            <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages} className="px-2 py-1 rounded-[5px] font-label-caps text-[9px] font-semibold hover:bg-black/[0.05] disabled:opacity-30 transition-colors" style={{ color: "var(--color-on-surface-variant)" }}>Next →</button>
          </div>
        </div>
      )}
    </div>
  );
}
