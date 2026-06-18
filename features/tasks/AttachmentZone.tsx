"use client";

import { useState, useRef, useCallback, DragEvent, ChangeEvent } from "react";
import {
  Upload, FileText, FileSpreadsheet, Image as ImageIcon,
  File, X, Download, Edit2, Check,
} from "lucide-react";
import type { Attachment } from "@/features/tasks";


function formatBytes(bytes: number): string {
  if (bytes < 1024)        return `${bytes} B`;
  if (bytes < 1048576)     return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1048576).toFixed(1)} MB`;
}

function detectType(mime: string, name: string): Attachment["type"] {
  if (mime.startsWith("image/"))                         return "image";
  if (mime === "application/pdf")                        return "pdf";
  if (mime.includes("spreadsheet") || mime.includes("excel") || name.endsWith(".xlsx") || name.endsWith(".csv")) return "sheet";
  if (mime.includes("word") || name.endsWith(".doc") || name.endsWith(".docx")) return "doc";
  return "other";
}

export function fileToAttachment(file: File): Attachment {
  return {
    id: `at_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    name: file.name,
    size: formatBytes(file.size),
    type: detectType(file.type, file.name),
    objectUrl: URL.createObjectURL(file),
    mimeType: file.type,
    uploadedAt: new Date().toISOString(),
  };
}


export function AttachmentTypeIcon({
  type, size = 14,
}: {
  type: Attachment["type"]; size?: number;
}) {
  const sw = 1.75;
  if (type === "pdf")   return <FileText   size={size} strokeWidth={sw} style={{ color: "rgba(186,26,26,0.7)" }} />;
  if (type === "sheet") return <FileSpreadsheet size={size} strokeWidth={sw} style={{ color: "rgba(0,130,70,0.75)" }} />;
  if (type === "image") return <ImageIcon   size={size} strokeWidth={sw} style={{ color: "rgba(0,100,200,0.7)" }} />;
  if (type === "doc")   return <FileText    size={size} strokeWidth={sw} style={{ color: "rgba(0,80,200,0.7)" }} />;
  return <File size={size} strokeWidth={sw} style={{ color: "var(--color-on-surface-variant)", opacity: 0.5 } as React.CSSProperties} />;
}


interface AttachmentZoneProps {
  attachments: Attachment[];
  onChange: (next: Attachment[]) => void;
  compact?: boolean;
}

export default function AttachmentZone({ attachments, onChange, compact }: AttachmentZoneProps) {
  const [dragging, setDragging]   = useState(false);
  const [renaming, setRenaming]   = useState<string | null>(null);
  const [renameVal, setRenameVal] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);


  const onDragOver  = useCallback((e: DragEvent) => { e.preventDefault(); setDragging(true); }, []);
  const onDragLeave = useCallback(() => setDragging(false), []);

  const onDrop = useCallback((e: DragEvent) => {
    e.preventDefault();
    setDragging(false);
    const files = Array.from(e.dataTransfer.files);
    if (!files.length) return;
    onChange([...attachments, ...files.map(fileToAttachment)]);
  }, [attachments, onChange]);

  const onFileChange = useCallback((e: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    if (!files.length) return;
    onChange([...attachments, ...files.map(fileToAttachment)]);
    e.target.value = "";
  }, [attachments, onChange]);


  function removeAttachment(id: string) {
    const att = attachments.find(a => a.id === id);
    if (att?.objectUrl) URL.revokeObjectURL(att.objectUrl);
    onChange(attachments.filter(a => a.id !== id));
  }

  function startRename(att: Attachment) {
    setRenaming(att.id);
    setRenameVal(att.name);
  }

  function commitRename(id: string) {
    if (renameVal.trim()) {
      onChange(attachments.map(a => a.id === id ? { ...a, name: renameVal.trim() } : a));
    }
    setRenaming(null);
  }

  function downloadAttachment(att: Attachment) {
    if (!att.objectUrl) return;
    const link = document.createElement("a");
    link.href = att.objectUrl;
    link.download = att.name;
    link.click();
  }

  return (
    <div className="space-y-2">
      {/* Existing attachment */}
      {attachments.length > 0 && (
        <div className="space-y-1.5">
          {attachments.map(att => (
            <div
              key={att.id}
              className="group flex items-center gap-2.5 px-2.5 py-2 rounded-[7px] transition-colors"
              style={{ border: "1px solid rgba(0,0,0,0.07)", background: "rgba(0,0,0,0.015)" }}
            >
              {/* Thumbnail / icon */}
              <div className="shrink-0 w-8 h-8 rounded-[5px] flex items-center justify-center overflow-hidden" style={{ background: "rgba(0,0,0,0.04)" }}>
                {att.type === "image" && att.objectUrl
                  ? <img src={att.objectUrl} alt={att.name} className="w-full h-full object-cover" />
                  : <AttachmentTypeIcon type={att.type} size={16} />
                }
              </div>

              {/* Name / rename */}
              <div className="flex-1 min-w-0">
                {renaming === att.id ? (
                  <input
                    autoFocus
                    value={renameVal}
                    onChange={e => setRenameVal(e.target.value)}
                    onKeyDown={e => {
                      if (e.key === "Enter") commitRename(att.id);
                      if (e.key === "Escape") setRenaming(null);
                    }}
                    onBlur={() => commitRename(att.id)}
                    className="w-full bg-transparent outline-none font-body-md text-[12px] border-b"
                    style={{ borderColor: "var(--color-primary)", color: "var(--color-on-surface)" }}
                  />
                ) : (
                  <p
                    className="font-body-md text-[12px] font-medium truncate"
                    style={{ color: "var(--color-on-surface)" }}
                    title={att.name}
                  >
                    {att.name}
                  </p>
                )}
                <p className="font-body-sm text-[10px]" style={{ color: "var(--color-on-surface-variant)", opacity: 0.45 }}>
                  {att.size}
                  {att.uploadedAt && ` · ${new Date(att.uploadedAt).toLocaleDateString("en-US", { month: "short", day: "numeric" })}`}
                </p>
              </div>

              {/* Actions (reveal on hover) */}
              <div className="flex items-center gap-0.5 opacity-50 group-hover:opacity-100 transition-opacity shrink-0">
                {renaming === att.id ? (
                  <button
                    onClick={() => commitRename(att.id)}
                    className="p-1 rounded-[4px] hover:bg-black/[0.06] transition-colors"
                    title="Confirm rename"
                  >
                    <Check size={11} strokeWidth={2} style={{ color: "rgba(0,120,60,0.8)" }} />
                  </button>
                ) : (
                  <>
                    {att.objectUrl && (
                      <button
                        onClick={() => downloadAttachment(att)}
                        className="p-1 rounded-[4px] hover:bg-black/[0.06] transition-colors"
                        title="Download"
                      >
                        <Download size={11} strokeWidth={1.75} style={{ color: "var(--color-on-surface-variant)", opacity: 0.6 } as React.CSSProperties} />
                      </button>
                    )}
                    <button
                      onClick={() => startRename(att)}
                      className="p-1 rounded-[4px] hover:bg-black/[0.06] transition-colors"
                      title="Rename"
                    >
                      <Edit2 size={11} strokeWidth={1.75} style={{ color: "var(--color-on-surface-variant)", opacity: 0.6 } as React.CSSProperties} />
                    </button>
                    <button
                      onClick={() => removeAttachment(att.id)}
                      className="p-1 rounded-[4px] hover:bg-red-50 transition-colors"
                      title="Remove"
                    >
                      <X size={11} strokeWidth={2} style={{ color: "rgba(186,26,26,0.65)" }} />
                    </button>
                  </>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Drop zone */}
      <div
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        onDrop={onDrop}
        onClick={() => inputRef.current?.click()}
        className="flex flex-col items-center justify-center cursor-pointer rounded-[8px] transition-all select-none"
        style={{
          border: `1.5px dashed ${dragging ? "var(--color-primary)" : "rgba(0,0,0,0.14)"}`,
          background: dragging ? "rgba(0,0,0,0.03)" : "transparent",
          padding: compact ? "12px 16px" : "20px 16px",
          gap: compact ? 4 : 6,
        }}
      >
        <Upload
          size={compact ? 14 : 18}
          strokeWidth={1.5}
          style={{ color: dragging ? "var(--color-primary)" : "var(--color-on-surface-variant)", opacity: dragging ? 0.8 : 0.35 } as React.CSSProperties}
        />
        <p
          className="font-body-md text-center"
          style={{ fontSize: compact ? 11 : 12, color: "var(--color-on-surface-variant)", opacity: 0.55 }}
        >
          {dragging ? "Drop files here" : "Drag & drop files or click to browse"}
        </p>
        {!compact && (
          <p className="font-body-sm text-[10px]" style={{ color: "var(--color-on-surface-variant)", opacity: 0.35 }}>
            Images, PDFs, Docs, Sheets — any format
          </p>
        )}
      </div>

      {/* Hidden file input */}
      <input
        ref={inputRef}
        type="file"
        multiple
        className="hidden"
        onChange={onFileChange}
      />
    </div>
  );
}
