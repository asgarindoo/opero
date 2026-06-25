"use client";

import { useMemo, useState } from "react";
import { ChevronDown, ChevronRight, Plus } from "lucide-react";
import type { Task, Status } from "@/features/tasks";
import { STATUS_META, PRIORITY_META, ALL_STATUSES } from "@/features/tasks";
import { EmptyState, RowSkeleton } from "@/components/common/DataState";
import UserAvatar from "@/components/common/UserAvatar";

interface Props {
  tasks: Task[];
  groupBy: "status" | "priority" | "assignee";
  onTaskClick: (task: Task) => void;
  onAddTask: (status?: Status) => void;
  search: string;
  loading?: boolean;
}

function TaskRow({ task, onClick }: { task: Task; onClick: () => void }) {
  const pm = PRIORITY_META[task.priority] || { label: task.priority || "None", bg: "rgba(0,0,0,0.05)", color: "rgba(0,0,0,0.6)" };
  const sm = STATUS_META[task.status] || { dot: "rgba(0,0,0,0.3)" };

  return (
    <div
      onClick={onClick}
      className="group flex items-center gap-3 px-4 py-2.5 border-b hover:bg-black/[0.02] cursor-pointer transition-colors"
      style={{ borderColor: "rgba(0,0,0,0.05)" }}
    >
      {/* Status dot */}
      <span className="w-2 h-2 rounded-full shrink-0" style={{ background: sm.dot }} />

      {/* Title */}
      <span
        className="flex-1 min-w-0 font-body-md text-[13px] font-medium truncate"
        style={{ color: "var(--color-on-surface)", opacity: 0.9 }}
      >
        {task.title}
      </span>

      {/* Labels */}
      <div className="hidden lg:flex items-center gap-1 shrink-0">
        {task.labels.slice(0, 2).map(l => (
          <span
            key={l}
            className="font-label-caps text-[8px] font-semibold px-1.5 py-0.5 rounded-full"
            style={{ background: "rgba(0,0,0,0.05)", color: "var(--color-on-surface-variant)" }}
          >
            {l}
          </span>
        ))}
      </div>

      {/* Priority */}
      <span
        className="font-label-caps text-[9px] font-semibold px-1.5 py-0.5 rounded shrink-0"
        style={{ background: pm.bg, color: pm.color }}
      >
        {pm.label}
      </span>

      {/* Assignee avatars */}
      <div className="flex items-center -space-x-1 shrink-0">
        {task.assignees.slice(0, 3).map(a => (
          <UserAvatar key={a.id} user={a} size="sm" className="border-white" />
        ))}
      </div>

      {/* Due date */}
      {task.due && (
        <span
          className="font-label-caps text-[9px] font-semibold shrink-0"
          style={{ color: "var(--color-on-surface-variant)", opacity: 0.45 }}
        >
          {new Date(task.due).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
        </span>
      )}

    </div>
  );
}

export default function ListView({ tasks, groupBy, onTaskClick, onAddTask, search, loading }: Props) {
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return q
      ? tasks.filter(t =>
        t.title.toLowerCase().includes(q) ||
        t.id.toLowerCase().includes(q) ||
        t.labels.some(l => l.toLowerCase().includes(q)) ||
        t.assignees.some(a => a.name.toLowerCase().includes(q))
      )
      : tasks;
  }, [tasks, search]);

  const groups = useMemo(() => {
    if (groupBy === "status") {
      return ALL_STATUSES
        .map(s => ({ key: s, label: s, tasks: filtered.filter(t => t.status === s) }))
        .filter(g => g.tasks.length > 0);
    }
    if (groupBy === "priority") {
      return (["urgent", "high", "medium", "low"] as const)
        .map(p => ({ key: p, label: PRIORITY_META[p].label, tasks: filtered.filter(t => t.priority === p) }))
        .filter(g => g.tasks.length > 0);
    }
    const byAssignee: Record<string, { key: string; label: string; tasks: Task[] }> = {
      unassigned: { key: "unassigned", label: "Unassigned", tasks: [] },
    };
    filtered.forEach(t => {
      if (t.assignees.length === 0) { byAssignee.unassigned.tasks.push(t); return; }
      const a = t.assignees[0];
      if (!byAssignee[a.id]) byAssignee[a.id] = { key: a.id, label: a.name, tasks: [] };
      byAssignee[a.id].tasks.push(t);
    });
    return Object.values(byAssignee).filter(g => g.tasks.length > 0);
  }, [filtered, groupBy]);

  function toggleCollapse(key: string) {
    setCollapsed(prev => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  }

  if (loading) {
    return <RowSkeleton rows={9} />;
  }

  if (filtered.length === 0) {
    return (
      <EmptyState
        icon="checklist"
        title="No tasks found"
        description="There are no tasks matching your current view or search filters."
      />
    );
  }

  return (
    <div className="flex-1 overflow-y-auto db-sidebar">
      {groups.map(group => {
        const isCollapsed = collapsed.has(group.key);
        const sm = STATUS_META[group.key as Status];
        return (
          <div key={group.key}>
            {/* Group header */}
            <div
              className="flex items-center gap-2 px-4 py-2 sticky top-0 z-10 cursor-pointer hover:bg-black/[0.015] transition-colors bg-[#fef8f8]"
              style={{ borderBottom: "1px solid rgba(0,0,0,0.05)" }}
              onClick={() => toggleCollapse(group.key)}
            >
              {isCollapsed
                ? <ChevronRight size={12} strokeWidth={2} style={{ color: "var(--color-on-surface-variant)", opacity: 0.5 }} />
                : <ChevronDown size={12} strokeWidth={2} style={{ color: "var(--color-on-surface-variant)", opacity: 0.5 }} />
              }
              {sm && <span className="w-2 h-2 rounded-full" style={{ background: sm.dot }} />}
              <span
                className="font-label-caps text-[10px] font-semibold uppercase tracking-[0.1em]"
                style={{ color: "var(--color-on-surface)", opacity: 0.7 }}
              >
                {group.label}
              </span>
              <span
                className="font-label-caps text-[9px] font-semibold px-1.5 py-0.5 rounded-full"
                style={{ background: "rgba(0,0,0,0.06)", color: "var(--color-on-surface-variant)" }}
              >
                {group.tasks.length}
              </span>
            </div>

            {/* Task rows */}
            {!isCollapsed && (
              <>
                {group.tasks.map(task => (
                  <TaskRow key={task.id} task={task} onClick={() => onTaskClick(task)} />
                ))}
                <button
                  onClick={() => onAddTask(groupBy === "status" ? group.key as Status : undefined)}
                  className="flex items-center gap-2 px-4 py-2 w-full hover:bg-black/[0.02] transition-colors border-b"
                  style={{ borderColor: "rgba(0,0,0,0.04)" }}
                >
                  <Plus size={11} strokeWidth={1.75} style={{ color: "var(--color-on-surface-variant)", opacity: 0.35 }} />
                  <span className="font-body-sm text-[11.5px]" style={{ color: "var(--color-on-surface-variant)", opacity: 0.35 }}>
                    Add task
                  </span>
                </button>
              </>
            )}
          </div>
        );
      })}
      <div className="h-16" />
    </div>
  );
}
