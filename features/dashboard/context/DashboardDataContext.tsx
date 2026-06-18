"use client";

import React, { createContext, useContext, useEffect, useState, useCallback } from "react";
import { getDashboardSummary } from "@/features/dashboard/services/dashboard.client";


export interface TaskItem {
  id: string;
  title: string;
  priority: string;
  status: string;
  assignee: string;          // kept for backward compat (first initials)
  assignees: { id: string; name: string; email?: string; image?: string | null; initials: string }[];
  due: string | null;
  labels: string[];
  checklist: { done: number; total: number };
  progress: number;
}

export interface ActivityItem {
  id: string;
  icon: string;
  userId?: string;
  user: string;
  userEmail?: string;
  userImage?: string | null;
  action: string;
  target: string;
  time: string;
}

export interface ProductivityBar {
  day: string;
  tasks: number;
}

export interface ProductivityMetric {
  label: string;
  value: string;
  delta: string;
  up: boolean;
}

export interface TeamMember {
  id?: string;
  name: string;
  email?: string;
  image?: string | null;
  role: string;
  tasks: number;
  done: number;
  initials: string;
  load: number;
}

export interface WorkflowBoard {
  id?: string;
  name: string;
  columns: { name: string; count: number }[];
  total: number;
}

export interface PipelineStage {
  label: string;
  count: number;
  value: number;
  pct: number;
  colorIndex: number;
}

export interface Deal {
  name: string;
  stage: string;
  value: string;
  ago: string;
}

export interface PerformanceMetric {
  label: string;
  value: string;
  suffix: string;
  delta: string;
  icon: string;
  trend: number[];
}

export interface DashboardData {
  tenantName: string;
  heroStats: {
    activeTasks: number;
    dueToday: number;
    openDeals: number;
    totalMembers: number;
  };
  activeTasks: { items: TaskItem[]; total: number };
  recentActivity: { items: ActivityItem[] };
  productivity: { bars: ProductivityBar[]; metrics: ProductivityMetric[] };
  teamPerformance: {
    members: TeamMember[];
    summary: { membersCount: number; tasksCount: number; donePct: number };
  };
  workflowProgress: { boards: WorkflowBoard[] };
  salesOverview: { stages: PipelineStage[]; recentDeals: Deal[] };
  calendar: { events: unknown[] };
  performance: { metrics: PerformanceMetric[] };
}

interface DashboardContextValue {
  data: DashboardData | null;
  loading: boolean;
  error: string | null;
  refresh: () => void;
}


const DashboardContext = createContext<DashboardContextValue | undefined>(undefined);

export function DashboardDataProvider({ children }: { children: React.ReactNode }) {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await getDashboardSummary();
      setData(result as unknown as DashboardData);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load dashboard data");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;

    Promise.resolve().then(() => {
      if (!cancelled) void load();
    });

    return () => {
      cancelled = true;
    };
  }, [load]);

  return (
    <DashboardContext.Provider value={{ data, loading, error, refresh: load }}>
      {children}
    </DashboardContext.Provider>
  );
}

export function useDashboardData() {
  const ctx = useContext(DashboardContext);
  if (!ctx) throw new Error("useDashboardData must be used within DashboardDataProvider");
  return ctx;
}
