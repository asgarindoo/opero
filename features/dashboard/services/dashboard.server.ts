import { prisma } from "@/lib/prisma";
import { mapDomainRecord } from "@/lib/api/domain-utils";
import { requirePermission } from "@/lib/server/rbac";
import { normalizeUserAvatarImage } from "@/lib/server/supabase-storage";
import { tenantRls } from "@/lib/server/tenant-rls";
import { getUserDisplayName, getUserInitials, type UserIdentity } from "@/lib/user-identity";

function getChecklistProgress(checklist?: Array<{ done: boolean }>) {
  if (!checklist || checklist.length === 0) return { done: 0, total: 0, progress: 0 };
  const done = checklist.filter((c) => c.done).length;
  const total = checklist.length;
  const progress = total > 0 ? Math.round((done / total) * 100) : 0;
  return { done, total, progress };
}

const ICON_MAP: Record<string, string> = {
  Created: "add_circle",
  Updated: "edit",
  Deleted: "delete",
};

export async function getDashboardSummary() {
  const ctx = await requirePermission("dashboard.read");

  const [org, taskRecords, flowRecords, saleRecords, activityRecords, members, contentRecords] = await Promise.all([
    // Use organization (correct model name)
    prisma.organization.findUnique({
      where: { id: ctx.tenantId },
      select: { name: true },
    }),
    tenantRls(ctx, (tx) =>
      tx.task.findMany({ where: { organizationId: ctx.tenantId }, orderBy: { updatedAt: "desc" } })
    ),
    prisma.flow.findMany({ where: { organizationId: ctx.tenantId }, orderBy: { updatedAt: "desc" } }),
    prisma.sale.findMany({ where: { organizationId: ctx.tenantId }, orderBy: { updatedAt: "desc" } }),
    prisma.tenantActivity.findMany({
      where: { organizationId: ctx.tenantId },
      orderBy: { createdAt: "desc" },
      take: 5,
      include: { user: { select: { id: true, name: true, email: true, image: true } } },
    }),
    prisma.member.findMany({
      where: { organizationId: ctx.tenantId },
      include: { user: { select: { id: true, name: true, email: true, image: true } } },
    }),
    prisma.contentPost.findMany({
      where: { organizationId: ctx.tenantId },
      orderBy: { createdAt: "desc" }
    }),
  ]);

  const tasks = taskRecords.map((r: any) => mapDomainRecord(r));
  const flows = flowRecords.map((r: any) => mapDomainRecord(r));
  const sales = saleRecords.map((r: any) => mapDomainRecord(r));
  const memberIdentityByUserId = new Map(
    members.map((m: any) => {
      const user = {
        id: m.user.id,
        name: getUserDisplayName(m.user),
        email: m.user.email,
        image: normalizeUserAvatarImage(m.user.id, m.user.image),
      };

      return [m.userId, user];
    })
  );

  function resolveMemberIdentity(snapshot: UserIdentity) {
    const id = snapshot.id ?? snapshot.userId ?? "";
    const memberUser = memberIdentityByUserId.get(id);
    const identity = memberUser ?? {
      id,
      name: getUserDisplayName(snapshot, "Member"),
      email: snapshot.email ?? null,
      image: id ? normalizeUserAvatarImage(id, snapshot.image ?? snapshot.avatar ?? null) : snapshot.image ?? snapshot.avatar ?? null,
    };

    return {
      id: identity.id ?? id,
      name: getUserDisplayName(identity, "Member"),
      email: identity.email ?? undefined,
      image: identity.image ?? null,
      initials: getUserInitials(identity),
    };
  }

  // Active tasks (top 5)
  const activeTasks = tasks.slice(0, 5).map((task: any) => {
    const checklist = getChecklistProgress(task.checklist as Array<{ done: boolean }> | undefined);
    const allAssignees = Array.isArray(task.assignees) ? task.assignees : [];
    const firstAssignee = allAssignees[0] ?? null;
    const resolvedAssignees = allAssignees.map((a: any) => resolveMemberIdentity(a));
    return {
      id: task.id ?? task.recordId,
      title: task.title ?? "Untitled",
      priority: task.priority ?? "medium",
      status: task.status ?? "Todo",
      assignee: firstAssignee ? resolvedAssignees[0]?.initials ?? "--" : "--",
      assignees: resolvedAssignees,
      due: task.due ?? null,
      labels: Array.isArray(task.labels) ? task.labels : [],
      checklist: { done: checklist.done, total: checklist.total },
      progress: checklist.progress,
    };
  });

  // Hero stats
  const todayStr = new Date().toISOString().slice(0, 10);
  const activeTaskCount = tasks.filter((t: any) => t.status !== "Done" && t.status !== "Cancelled").length;
  const dueTodayCount = tasks.filter((t: any) => {
    if (!t.due) return false;
    return String(t.due).slice(0, 10) === todayStr && t.status !== "Done";
  }).length;
  const openDealsCount = sales.filter((s: any) => s.status !== "Won" && s.status !== "Lost").length;

  // Recent activity
  const recentActivity = activityRecords.map((log: any) => ({
    id: log.id,
    icon: ICON_MAP[log.action] ?? "timeline",
    userId: log.user?.id ?? log.userId ?? "system",
    user: getUserDisplayName(log.user, "System"),
    userEmail: log.user?.email ?? undefined,
    userImage: log.user?.id ? normalizeUserAvatarImage(log.user.id, log.user.image) : null,
    action: log.action.toLowerCase(),
    target: log.entityName ?? log.entityType ?? "Record",
    time: log.createdAt.toISOString(),
  }));

  // Productivity
  const weekDays = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
  const now = new Date();
  const weekStart = new Date(now);
  weekStart.setDate(now.getDate() - ((now.getDay() + 6) % 7));
  weekStart.setHours(0, 0, 0, 0);

  const bars = weekDays.map((day, idx) => {
    const dayStart = new Date(weekStart);
    dayStart.setDate(weekStart.getDate() + idx);
    const dayEnd = new Date(dayStart);
    dayEnd.setDate(dayStart.getDate() + 1);
    const count = tasks.filter((task: any) => {
      const updatedAt = new Date(task.recordUpdatedAt ?? task.updatedAt ?? task.updated ?? 0);
      return task.status === "Done" && updatedAt >= dayStart && updatedAt < dayEnd;
    }).length;
    return { day, tasks: count };
  });

  const totalTasks = taskRecords.length;
  const doneTasks = tasks.filter((t: any) => t.status === "Done").length;
  const blockedTasks = tasks.filter((t: any) => t.status === "Blocked" || t.status === "In Review").length;
  const completionRate = totalTasks > 0 ? Math.round((doneTasks / totalTasks) * 100) : 0;

  const productivityMetrics = [
    { label: "Tasks completed", value: String(doneTasks), delta: `+${doneTasks}`, up: true },
    { label: "Completion rate", value: totalTasks > 0 ? `${completionRate}%` : "--", delta: "0", up: true },
    { label: "Blocked tasks", value: String(blockedTasks), delta: "0", up: blockedTasks === 0 },
    { label: "Active tasks", value: String(activeTaskCount), delta: "0", up: true },
  ];

  // Team performance
  const teamMembers = members.map((m: any) => {
    const name = getUserDisplayName(m.user, "Member");
    const assigned = tasks.filter((t: any) => Array.isArray(t.assignees) && t.assignees.some((a: any) => a.id === m.userId));
    const doneCount = assigned.filter((t: any) => t.status === "Done").length;
    const load = assigned.length ? Math.round((doneCount / assigned.length) * 100) : 0;
    return {
      id: m.userId,
      name,
      email: m.user.email,
      image: normalizeUserAvatarImage(m.userId, m.user.image),
      role: m.role === "owner" ? "Owner" : m.role === "admin" ? "Admin" : "Staff",
      tasks: assigned.length,
      done: doneCount,
      initials: getUserInitials({ name, email: m.user.email }),
      load,
    };
  });

  // Workflow boards
  const workflowBoards = flows.map((flow: any) => {
    const stages = Array.isArray(flow.stages) ? flow.stages : [];
    const completed = stages.filter((s: any) => s.isCompleted).length;
    const total = stages.length || 1;
    return {
      id: flow.id ?? flow.recordId,
      name: flow.name ?? "Flow",
      columns: [
        { name: "Completed", count: completed },
        { name: "Remaining", count: Math.max(0, total - completed) },
      ],
      total,
    };
  });

  // Sales pipeline
  const pipelineStages = ["Pending", "Processing", "Completed", "Cancelled"].map((label, index) => {
    const count = sales.filter((s: any) => s.status === label || s.stage === label).length;
    const value = sales
      .filter((s: any) => s.status === label || s.stage === label)
      .reduce((acc: any, s: any) => acc + (Number(s.value ?? s.total ?? s.grandTotal) || 0), 0);
    const pct = sales.length ? Math.round((count / sales.length) * 100) : 0;
    return { label, count, value, pct, colorIndex: index };
  });

  const recentDeals = sales.slice(0, 2).map((sale: any) => ({
    name: sale.title ?? sale.contactName ?? sale.name ?? "Deal",
    stage: sale.status ?? "Pending",
    value: sale.total ? `$${Number(sale.total).toLocaleString()}` : "$0",
    ago: "Updated",
  }));

  // Calendar
  const contents = contentRecords.map((r: any) => mapDomainRecord(r));

  const calendarEvents = contents
    .filter((c: any) => {
      const dateStr = c.date || c.postDate || c.publishDate || (c.createdAt ? String(c.createdAt) : "");
      return dateStr && String(dateStr).slice(0, 10) === todayStr;
    })
    .map((c: any) => ({
      title: c.title ?? c.name ?? "Content Post",
      type: "event",
      time: c.time ?? "Today",
    }))
    .slice(0, 5);
  const performanceMetrics = [
    {
      label: "Tasks Completed",
      value: String(doneTasks),
      suffix: "",
      delta: String(doneTasks),
      icon: "task_alt",
      trend: bars.map((b) => b.tasks),
    },
    {
      label: "Active Flows",
      value: String(flows.length),
      suffix: "",
      delta: String(flows.length),
      icon: "bolt",
      trend: [0, 0, 0, 0, 0, 0, flows.length],
    },
    {
      label: "Team Members",
      value: String(members.length),
      suffix: "",
      delta: String(members.length),
      icon: "group",
      trend: [0, 0, 0, 0, 0, 0, members.length],
    },
    {
      label: "Open Deals",
      value: String(openDealsCount),
      suffix: "",
      delta: String(openDealsCount),
      icon: "shopping_cart",
      trend: [0, 0, 0, 0, 0, 0, openDealsCount],
    },
  ];

  return {
    tenantName: org?.name ?? "Your Workspace",
    heroStats: {
      activeTasks: activeTaskCount,
      dueToday: dueTodayCount,
      openDeals: openDealsCount,
      totalMembers: members.length,
    },
    activeTasks: { items: activeTasks, total: taskRecords.length },
    recentActivity: { items: recentActivity },
    productivity: { bars, metrics: productivityMetrics },
    teamPerformance: {
      members: teamMembers,
      summary: {
        membersCount: teamMembers.length,
        tasksCount: taskRecords.length,
        donePct: totalTasks ? Math.round((doneTasks / totalTasks) * 100) : 0,
      },
    },
    workflowProgress: { boards: workflowBoards },
    salesOverview: { stages: pipelineStages, recentDeals },
    calendar: { events: calendarEvents },
    performance: { metrics: performanceMetrics },
  };
}
