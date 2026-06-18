"use client";

import { useMemo } from "react";
import type { Task } from "@/features/tasks";
import { STATUS_META, PRIORITY_META, ALL_STATUSES } from "@/features/tasks";

interface Props {
  tasks: Task[];
  onTaskClick: (task: Task) => void;
}

function daysBetween(a: string, b: string) {
  return Math.max(1, Math.round((new Date(b).getTime() - new Date(a).getTime()) / 86_400_000));
}

function dayOffset(from: string, base: string) {
  return Math.round((new Date(from).getTime() - new Date(base).getTime()) / 86_400_000);
}

export default function TimelineView({ tasks, onTaskClick }: Props) {
  const { baseDate, totalDays, tasksWithPos } = useMemo(() => {
    const withDates = tasks.filter(t => t.due);
    if (!withDates.length) return { baseDate: "", totalDays: 30, tasksWithPos: [] };

    const dates = withDates.flatMap(t => {
      const start = t.startDate || t.created || t.due!;
      return [start, t.due!];
    });

    const minDate = dates.reduce((a, b) => a < b ? a : b);
    const maxDate = dates.reduce((a, b) => a > b ? a : b);
    const total = Math.max(30, daysBetween(minDate, maxDate) + 6);

    const pos = withDates.map(t => {
      const startStr = t.startDate || t.created || t.due!;
      const start = dayOffset(startStr, minDate);
      const end = dayOffset(t.due!, minDate);
      const width = Math.max(1, end - start);
      return { task: t, start, end, width };
    });

    return { baseDate: minDate, totalDays: total, tasksWithPos: pos };
  }, [tasks]);

  const DAY_W = 32;
  const ROW_H = 36;
  const LABEL_W = 240;

  const today = new Date().toISOString().slice(0, 10);
  const todayOff = baseDate ? dayOffset(today, baseDate) : -1;

  const statusGroups = ALL_STATUSES.map(s => ({
    status: s,
    items: tasksWithPos.filter(p => p.task.status === s),
  })).filter(g => g.items.length > 0);

  if (!baseDate) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <p className="font-body-md text-[14px]" style={{ color: "var(--color-on-surface-variant)", opacity: 0.4 }}>No tasks with due dates to display</p>
      </div>
    );
  }

  const dayHeaders: { offset: number; label: string }[] = [];
  for (let i = 0; i < totalDays; i += 7) {
    const d = new Date(baseDate);
    d.setDate(d.getDate() + i);
    dayHeaders.push({ offset: i, label: d.toLocaleDateString("en-US", { month: "short", day: "numeric" }) });
  }

  return (
    <div className="flex-1 overflow-auto db-sidebar">
      <div style={{ minWidth: LABEL_W + totalDays * DAY_W + 32 }}>
        {/* Header row */}
        <div className="flex sticky top-0 z-20 bg-[#fef8f8]" style={{ borderBottom: "1px solid rgba(0,0,0,0.07)" }}>
          <div style={{ width: LABEL_W, flexShrink: 0, borderRight: "1px solid rgba(0,0,0,0.07)" }}
            className="px-4 py-2">
            <span style={{ color: "var(--color-on-surface-variant)", opacity: 0.4 }} className="font-label-caps text-[9px] font-semibold uppercase tracking-[0.1em]">Task</span>
          </div>
          <div className="relative flex-1" style={{ height: 36 }}>
            {dayHeaders.map(h => (
              <div key={h.offset} className="absolute top-0 flex items-center"
                style={{ left: h.offset * DAY_W, height: "100%", paddingLeft: 4 }}>
                <span className="font-label-caps text-[9px] font-semibold" style={{ color: "var(--color-on-surface-variant)", opacity: 0.45 }}>{h.label}</span>
              </div>
            ))}
            {/* Today line */}
            {todayOff >= 0 && todayOff <= totalDays && (
              <div className="absolute top-0 bottom-0 w-px" style={{ left: todayOff * DAY_W, background: "rgba(186,26,26,0.5)" }} />
            )}
          </div>
        </div>

        {/* Groups */}
        {statusGroups.map(group => {
          const sm = STATUS_META[group.status] || { dot: "rgba(0,0,0,0.3)" };
          return (
            <div key={group.status}>
              {/* Group label */}
              <div className="flex items-center gap-2 px-4 py-1.5 sticky top-[37px] z-10 bg-[#fcf5f5]" style={{ borderBottom: "1px solid rgba(0,0,0,0.05)" }}>
                <span className="w-1.5 h-1.5 rounded-full" style={{ background: sm.dot }} />
                <span className="font-label-caps text-[9px] font-semibold uppercase tracking-[0.1em]" style={{ color: "var(--color-on-surface)", opacity: 0.6 }}>{group.status}</span>
                <span className="font-label-caps text-[8px] font-semibold px-1.5 py-0.5 rounded-full" style={{ background: "rgba(0,0,0,0.06)", color: "var(--color-on-surface-variant)" }}>{group.items.length}</span>
              </div>

              {/* Task bars */}
              {group.items.map(({ task, start, width }) => {
                const pm = PRIORITY_META[task.priority] || { label: task.priority || "None", bg: "rgba(0,0,0,0.05)", color: "rgba(0,0,0,0.6)" };
                return (
                  <div key={task.id} className="flex items-center border-b" style={{ borderColor: "rgba(0,0,0,0.04)", height: ROW_H }}>
                    {/* Label */}
                    <div className="flex items-center gap-2 px-4 shrink-0" style={{ width: LABEL_W, borderRight: "1px solid rgba(0,0,0,0.05)" }}>
                      <span className="font-label-caps text-[8px] font-semibold shrink-0" style={{ color: "var(--color-on-surface-variant)", opacity: 0.38 }}>{task.id}</span>
                      <span className="font-body-md text-[11.5px] truncate" style={{ color: "var(--color-on-surface)", opacity: 0.85 }}>{task.title}</span>
                    </div>

                    {/* Bar track */}
                    <div className="relative flex-1" style={{ height: "100%" }}>
                      {/* Today line */}
                      {todayOff >= 0 && todayOff <= totalDays && (
                        <div className="absolute top-0 bottom-0 w-px" style={{ left: todayOff * DAY_W, background: "rgba(186,26,26,0.2)" }} />
                      )}

                      {/* Task bar */}
                      <button
                        onClick={() => onTaskClick(task)}
                        className="absolute top-1/2 -translate-y-1/2 rounded-[5px] flex items-center px-2 hover:brightness-95 transition-all"
                        style={{
                          left: start * DAY_W + 4,
                          width: Math.max(width * DAY_W - 8, 40),
                          height: 22,
                          background: pm.bg,
                          border: `1px solid ${pm.color}33`,
                        }}
                      >
                        <span className="font-label-caps text-[9px] font-semibold truncate" style={{ color: pm.color }}>{task.title}</span>
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          );
        })}
      </div>
    </div>
  );
}
