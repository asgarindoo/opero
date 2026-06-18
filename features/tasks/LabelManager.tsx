"use client";

import { useState, useRef, useEffect, KeyboardEvent } from "react";
import { X, Plus, Check } from "lucide-react";
import { addCustomLabel, deleteCustomLabel, getLabels, DEFAULT_LABELS } from "@/features/tasks";

interface Props {
  selected: string[];
  onChange: (labels: string[]) => void;
}

export default function LabelManager({ selected, onChange }: Props) {
  const [allLabels, setAllLabels] = useState<string[]>(() => getLabels());
  const [creating,  setCreating]  = useState(false);
  const [newLabel,  setNewLabel]  = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (creating) inputRef.current?.focus();
  }, [creating]);

  function toggle(label: string) {
    onChange(selected.includes(label)
      ? selected.filter(l => l !== label)
      : [...selected, label]);
  }

  function confirmCreate() {
    const trimmed = newLabel.trim();
    if (!trimmed) { setCreating(false); setNewLabel(""); return; }
    const next = addCustomLabel(trimmed);
    setAllLabels(next);
    if (!selected.includes(trimmed)) onChange([...selected, trimmed]);
    setNewLabel("");
    setCreating(false);
  }

  function handleKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter") { e.preventDefault(); confirmCreate(); }
    if (e.key === "Escape") { setCreating(false); setNewLabel(""); }
  }

  function removeLabel(label: string) {
    const next = deleteCustomLabel(label);
    setAllLabels(next);
    if (selected.includes(label)) onChange(selected.filter(l => l !== label));
  }

  return (
    <div className="flex flex-wrap gap-1.5 items-center">
      {allLabels.map(l => {
        const active = selected.includes(l);
        return (
          <div key={l} className="relative group flex items-center">
            <button
              onClick={() => toggle(l)}
              className={`flex items-center gap-1 font-label-caps text-[9px] font-bold px-2.5 py-1 rounded-full transition-all max-w-full border ${
                active
                  ? "bg-zinc-900 text-white border-transparent shadow-sm"
                  : "bg-[#f8f3f2] text-zinc-600 border-transparent hover:bg-[#f0e8e7]"
              }`}
            >
              {active && <Check size={8} strokeWidth={3} className="shrink-0" />}
              <span className="truncate max-w-[200px] tracking-wide">{l}</span>
            </button>
            {/* Delete label */}
            {!DEFAULT_LABELS.includes(l) && (
              <button
                onClick={(e) => { e.preventDefault(); e.stopPropagation(); removeLabel(l); }}
                className={`absolute -top-1 -right-1 w-3.5 h-3.5 rounded-full flex items-center justify-center transition-all z-10 shadow-sm opacity-100 hover:scale-110 ${
                  active 
                    ? "bg-zinc-700 text-zinc-300 hover:bg-red-500 hover:text-white" 
                    : "bg-white text-zinc-400 hover:bg-red-500 hover:text-white"
                }`}
                title={`Delete label "${l}"`}
              >
                <X size={7} strokeWidth={3} />
              </button>
            )}
          </div>
        );
      })}

      {/* Create new label */}
      {creating ? (
        <div
          className="flex items-center gap-1 px-2 py-1 rounded-full"
          style={{ border: "1.5px solid var(--color-primary)", background: "rgba(0,0,0,0.02)" }}
        >
          <input
            ref={inputRef}
            maxLength={15}
            value={newLabel}
            onChange={e => setNewLabel(e.target.value)}
            onKeyDown={handleKeyDown}
            onBlur={confirmCreate}
            placeholder="Label name…"
            className="bg-transparent outline-none font-label-caps text-[9px] font-semibold"
            style={{ color: "var(--color-on-surface)", width: 80 }}
          />
          <button onClick={confirmCreate}>
            <Check size={9} strokeWidth={3} style={{ color: "var(--color-primary)" }} />
          </button>
        </div>
      ) : (
        <button
          onClick={() => setCreating(true)}
          className="flex items-center gap-1 font-label-caps text-[9px] font-semibold px-2.5 py-1 rounded-full transition-all hover:bg-black/[0.06]"
          style={{ border: "1.5px dashed rgba(0,0,0,0.2)", color: "var(--color-on-surface-variant)", opacity: 0.7 }}
        >
          <Plus size={9} strokeWidth={2.5} />
          New Label
        </button>
      )}
    </div>
  );
}
