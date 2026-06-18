"use client";

import { useState, useMemo } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import type { Task } from "@/features/tasks";
import { STATUS_META, PRIORITY_META } from "@/features/tasks";

interface Props {
  tasks: Task[];
  onTaskClick: (task: Task) => void;
}

const MONTH_NAMES = ["January","February","March","April","May","June","July","August","September","October","November","December"];
const DAY_NAMES   = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];

export default function CalendarView({ tasks, onTaskClick }: Props) {
  const today = new Date();
  const [year,  setYear]  = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth());

  function prev() { if (month === 0) { setYear(y => y - 1); setMonth(11); } else setMonth(m => m - 1); }
  function next() { if (month === 11) { setYear(y => y + 1); setMonth(0); } else setMonth(m => m + 1); }

  const { weeks, tasksByDate } = useMemo(() => {
    const firstDay = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();

    const cells: (Date | null)[] = [];
    for (let i = 0; i < firstDay; i++) cells.push(null);
    for (let d = 1; d <= daysInMonth; d++) cells.push(new Date(year, month, d));
    while (cells.length % 7 !== 0) cells.push(null);

    const weeks: (Date | null)[][] = [];
    for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));

    const byDate: Record<string, Task[]> = {};
    tasks.forEach(t => {
      if (!t.due) return;
      const key = t.due.slice(0, 10);
      if (!byDate[key]) byDate[key] = [];
      byDate[key].push(t);
    });

    return { weeks, tasksByDate: byDate };
  }, [year, month, tasks]);

  const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2,"0")}-${String(today.getDate()).padStart(2,"0")}`;

  return (
    <div className="flex-1 overflow-y-auto db-sidebar p-4">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <h2 className="font-display text-[16px] font-semibold" style={{ color: "var(--color-on-surface)" }}>{MONTH_NAMES[month]} {year}</h2>
        <div className="flex items-center gap-1">
          <button onClick={prev} className="p-1.5 rounded-[6px] hover:bg-black/[0.06] transition-colors">
            <ChevronLeft size={14} strokeWidth={2} style={{ color: "var(--color-on-surface-variant)" }} />
          </button>
          <button onClick={() => { setYear(today.getFullYear()); setMonth(today.getMonth()); }} className="font-label-caps text-[9px] font-semibold px-2.5 py-1.5 rounded-[6px] hover:bg-black/[0.06] transition-colors uppercase tracking-[0.06em]" style={{ color: "var(--color-on-surface-variant)", opacity: 0.7 }}>Today</button>
          <button onClick={next} className="p-1.5 rounded-[6px] hover:bg-black/[0.06] transition-colors">
            <ChevronRight size={14} strokeWidth={2} style={{ color: "var(--color-on-surface-variant)" }} />
          </button>
        </div>
      </div>

      {/* Day labels */}
      <div className="grid grid-cols-7 mb-1">
        {DAY_NAMES.map(d => (
          <div key={d} className="py-1 text-center font-label-caps text-[9px] font-semibold uppercase tracking-[0.1em]" style={{ color: "var(--color-on-surface-variant)", opacity: 0.4 }}>{d}</div>
        ))}
      </div>

      {/* Calendar grid */}
      <div className="grid grid-cols-7 gap-0.5">
        {weeks.flat().map((date, i) => {
          if (!date) return <div key={i} className="min-h-[90px] rounded-[6px]" style={{ background: "rgba(0,0,0,0.01)" }} />;

          const dateStr = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2,"0")}-${String(date.getDate()).padStart(2,"0")}`;
          const dayTasks = tasksByDate[dateStr] ?? [];
          const isToday  = dateStr === todayStr;
          const isPast   = date < today && !isToday;

          return (
            <div
              key={dateStr}
              className="min-h-[90px] rounded-[6px] p-1.5 flex flex-col"
              style={{
                background: isToday ? "rgba(0,0,0,0.04)" : "rgba(0,0,0,0.015)",
                border: isToday ? "1.5px solid rgba(0,0,0,0.18)" : "1px solid rgba(0,0,0,0.05)",
              }}
            >
              <span
                className="font-label-caps text-[10px] font-semibold mb-1 w-5 h-5 flex items-center justify-center rounded-full"
                style={{
                  color: isToday ? "var(--color-on-primary)" : isPast ? "rgba(0,0,0,0.3)" : "var(--color-on-surface)",
                  background: isToday ? "var(--color-primary)" : "transparent",
                  opacity: isPast && !isToday ? 0.5 : 1,
                }}
              >
                {date.getDate()}
              </span>

              {/* Tasks for this day */}
              <div className="space-y-0.5 flex-1 overflow-hidden">
                {dayTasks.slice(0, 3).map(t => {
                  const pm = PRIORITY_META[t.priority] || { label: t.priority || "None", bg: "rgba(0,0,0,0.05)", color: "rgba(0,0,0,0.6)" };
                  const sm = STATUS_META[t.status] || { dot: "rgba(0,0,0,0.3)" };
                  return (
                    <button
                      key={t.id}
                      onClick={() => onTaskClick(t)}
                      className="w-full text-left flex items-center gap-1 px-1 py-0.5 rounded-[4px] hover:opacity-80 transition-opacity"
                      style={{ background: pm.bg }}
                    >
                      <span className="w-1 h-1 rounded-full shrink-0" style={{ background: sm.dot }} />
                      <span className="font-body-sm text-[9.5px] truncate" style={{ color: pm.color }}>{t.title}</span>
                    </button>
                  );
                })}
                {dayTasks.length > 3 && (
                  <span className="font-label-caps text-[8px] font-semibold px-1" style={{ color: "var(--color-on-surface-variant)", opacity: 0.45 }}>+{dayTasks.length - 3} more</span>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
