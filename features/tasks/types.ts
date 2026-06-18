export type Priority = "urgent" | "high" | "medium" | "low";
export type Status = "Backlog" | "Todo" | "In Progress" | "In Review" | "Done" | "Cancelled";
export type RecurringSchedule = "none" | "daily" | "weekly" | "biweekly" | "monthly";

export interface Member {
  id: string;
  name: string;
  initials: string;
  email?: string;
  image?: string | null;
  role?: string;
}

export interface ChecklistItem {
  id: string;
  text: string;
  done: boolean;
  assigneeId?: string;
}

export interface ExternalLink {
  id: string;
  url: string;
  title: string;
}

export interface Reaction {
  emoji: string;
  count: number;
  reactedByMe: boolean;
  reactors: string[]; // member names
}

export interface Comment {
  id: string;
  userId?: string;
  author: string;
  email?: string;
  initials: string;
  avatar?: string | null;
  body: string;
  timestamp: string;
  reactions?: Record<string, Reaction>; // emoji → Reaction
  mentions?: string[]; // member ids mentioned
}

export interface ActivityEntry {
  id: string;
  actorId?: string;
  actor: string;
  action: string;
  detail?: string;
  timestamp: string;
}

export interface Attachment {
  id: string;
  name: string;
  size: string;          // human-readable e.g. "2.4 MB"
  type: "pdf" | "image" | "doc" | "sheet" | "other";
  objectUrl?: string;    // URL.createObjectURL for client-side preview/download
  mimeType?: string;     // original MIME type
  uploadedAt?: string;   // ISO date string
}

export interface Task {
  id: string;
  title: string;
  description: string;
  priority: Priority;
  status: Status;
  assignees: Member[];
  labels: string[];
  startDate?: string | null;
  due: string | null;
  recurring?: RecurringSchedule;
  created: string;
  checklist: ChecklistItem[];
  externalLinks?: ExternalLink[];
  comments: Comment[];
  activity: ActivityEntry[];
  attachments: Attachment[];
  campaignId?: string | null;
  recordId?: string;
  recordCreatedAt?: string;
  recordUpdatedAt?: string;
}

export const ALL_STATUSES: Status[] = ["Backlog", "Todo", "In Progress", "In Review", "Done", "Cancelled"];
export const ALL_PRIORITIES: Priority[] = ["urgent", "high", "medium", "low"];
export const ALL_RECURRING: { value: RecurringSchedule; label: string }[] = [
  { value: "none", label: "No Repeat" },
  { value: "daily", label: "Daily" },
  { value: "weekly", label: "Weekly" },
  { value: "biweekly", label: "Bi-weekly" },
  { value: "monthly", label: "Monthly" },
];

export const PRIORITY_META: Record<Priority, { label: string; color: string; bg: string; dot: string }> = {
  urgent: { label: "Urgent", color: "rgba(186,26,26,0.9)", bg: "rgba(186,26,26,0.09)", dot: "rgba(186,26,26,0.8)" },
  high: { label: "High", color: "rgba(186,26,26,0.75)", bg: "rgba(186,26,26,0.06)", dot: "rgba(186,26,26,0.6)" },
  medium: { label: "Medium", color: "rgba(0,0,0,0.6)", bg: "rgba(0,0,0,0.055)", dot: "rgba(0,0,0,0.5)" },
  low: { label: "Low", color: "rgba(0,0,0,0.38)", bg: "rgba(0,0,0,0.035)", dot: "rgba(0,0,0,0.3)" },
};

export const STATUS_META: Record<Status, { color: string; bg: string; dot: string }> = {
  "Backlog": { color: "rgba(0,0,0,0.38)", bg: "rgba(0,0,0,0.04)", dot: "rgba(0,0,0,0.25)" },
  "Todo": { color: "rgba(0,0,0,0.55)", bg: "rgba(0,0,0,0.055)", dot: "rgba(0,0,0,0.45)" },
  "In Progress": { color: "rgba(0,0,0,0.8)", bg: "rgba(0,0,0,0.07)", dot: "rgba(0,0,0,0.7)" },
  "In Review": { color: "rgba(0,80,180,0.75)", bg: "rgba(0,80,180,0.07)", dot: "rgba(0,80,180,0.6)" },
  "Done": { color: "rgba(0,120,60,0.8)", bg: "rgba(0,120,60,0.08)", dot: "rgba(0,120,60,0.7)" },
  "Cancelled": { color: "rgba(0,0,0,0.3)", bg: "rgba(0,0,0,0.035)", dot: "rgba(0,0,0,0.2)" },
};

// Simpan label di localStorage

const LABEL_STORAGE_KEY = "opero_task_labels";

export const DEFAULT_LABELS = [
  "Design", "Client", "Bot", "Automation",
  "Finance", "Operations", "Marketing", "Team",
];

function loadLabels(): string[] {
  if (typeof window === "undefined") return DEFAULT_LABELS;
  try {
    const raw = localStorage.getItem(LABEL_STORAGE_KEY);
    if (!raw) return DEFAULT_LABELS;
    const parsed = JSON.parse(raw) as string[];
    return Array.isArray(parsed) && parsed.length > 0 ? parsed : DEFAULT_LABELS;
  } catch { return DEFAULT_LABELS; }
}

export function getLabels(): string[] { return loadLabels(); }

export function addCustomLabel(label: string): string[] {
  const trimmed = label.trim();
  if (!trimmed) return loadLabels();
  const current = loadLabels();
  if (current.includes(trimmed)) return current;
  const next = [...current, trimmed];
  if (typeof window !== "undefined") localStorage.setItem(LABEL_STORAGE_KEY, JSON.stringify(next));
  return next;
}

export function deleteCustomLabel(label: string): string[] {
  const next = loadLabels().filter(l => l !== label);
  if (typeof window !== "undefined") localStorage.setItem(LABEL_STORAGE_KEY, JSON.stringify(next));
  return next;
}


export const ALL_LABELS = DEFAULT_LABELS;

export function getMemberById(id: string): Member | undefined {
  return undefined;
}
