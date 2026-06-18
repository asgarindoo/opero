
import type { UserIdentity } from "@/lib/user-identity";

export type FlowCategory = 
  | "Onboarding" 
  | "Approvals" 
  | "Recruitment" 
  | "Marketing" 
  | "Operations" 
  | "Finance" 
  | "Production";

export type FlowStatus = "Active" | "Completed" | "Archived" | "Paused";


export interface ChecklistItem {
  id: string;
  text: string;
  isCompleted: boolean;
}

export interface FlowStage {
  id: string;
  name: string;
  description?: string;
  isCompleted: boolean;
  checklist: ChecklistItem[];
  order: number;
}

export type WorkflowStageType = "start" | "task" | "approval" | "decision" | "completion";

export type WorkflowStage = FlowStage & {
  stageType?: WorkflowStageType;
  approvalRequired?: boolean;
  slaHours?: number;
  isCompletion?: boolean;
  isDefault?: boolean;
};

export interface FlowNote {
  id: string;
  user: UserIdentity;
  text: string;
  timestamp: string;
}

export interface Flow {
  id: string;
  name: string;
  description: string;
  category: FlowCategory;
  status: FlowStatus;
  progress: number;
  stages: FlowStage[];
  dueDate?: string;
  updated: string;
  owner: UserIdentity & {
    id: string;
    name: string;
  };
  notes?: FlowNote[];
  relatedTasksCount?: number;
  relatedDocsCount?: number;
  isActive?: boolean;
  tasksCount?: number;
  usageStats?: {
    successRate: number;
    avgCompletionDays: number;
  };
}

export const STAGE_TYPE_META: Record<WorkflowStageType, { label: string }> = {
  start: { label: "Start" },
  task: { label: "Task" },
  approval: { label: "Approval" },
  decision: { label: "Decision" },
  completion: { label: "Completion" },
};


export const FLOW_CATEGORIES: FlowCategory[] = [
  "Onboarding", "Approvals", "Recruitment", "Marketing", "Operations", "Finance", "Production"
];

export const CATEGORY_COLORS: Record<FlowCategory, string> = {
  Onboarding: "text-blue-500 bg-blue-50",
  Approvals: "text-emerald-500 bg-emerald-50",
  Recruitment: "text-amber-500 bg-amber-50",
  Marketing: "text-rose-500 bg-rose-50",
  Operations: "text-slate-500 bg-slate-50",
  Finance: "text-indigo-500 bg-indigo-50",
  Production: "text-purple-500 bg-purple-50",
};

