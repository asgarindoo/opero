import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/server/rbac";
import { getStatus, getTitle, logDomainActivity, mapDomainRecord, parsePayload } from "@/lib/api/domain-utils";
import { dateValue, intValue, jsonObjectOrUndefined, textValue } from "@/lib/api/feature-records";

const MODULE = "GOALS";
const ENTITY = "Goal";

function normalizeGoalStatus(status: unknown) {
  const key = typeof status === "string" ? status.toLowerCase().replace(/\s+/g, "-") : "";
  if (key === "on-track" || key === "at-risk" || key === "behind" || key === "completed") return key;
  if (key === "paused") return "behind";
  return "on-track";
}

const PAYLOAD_KEYS = ["collaboratorIds", "keyResults", "milestones", "linkedItems", "archived", "parentId"] as const;

function goalPayload(data: Record<string, unknown>, currentPayload?: unknown) {
  const payload = { ...parsePayload(currentPayload) };

  for (const key of PAYLOAD_KEYS) {
    if (data[key] !== undefined) payload[key] = data[key];
  }

  return jsonObjectOrUndefined(payload) ?? {};
}

function mapGoal(record: any, fallbackUser?: { id: string; name: string; email?: string | null; image?: string | null }) {
  const mapped = mapDomainRecord(record, fallbackUser) as any;
  const payload = parsePayload(record.payload);
  return {
    ...mapped,
    status: normalizeGoalStatus(mapped.status),
    priority: mapped.priority ?? "medium",
    startDate: mapped.startDate ?? mapped.recordCreatedAt ?? "",
    targetDate: mapped.dueDate ?? "",
    collaboratorIds: Array.isArray(payload.collaboratorIds) ? payload.collaboratorIds : [],
    keyResults: Array.isArray(payload.keyResults) ? payload.keyResults : [],
    milestones: Array.isArray(payload.milestones) ? payload.milestones : [],
    linkedItems: Array.isArray(payload.linkedItems) ? payload.linkedItems : [],
    archived: typeof payload.archived === "boolean" ? payload.archived : false,
    parentId: typeof payload.parentId === "string" ? payload.parentId : undefined,
  };
}

export async function listGoals() {
  const ctx = await requirePermission("goals.read");
  const goals = await prisma.goal.findMany({ where: { organizationId: ctx.tenantId }, orderBy: { createdAt: "desc" }, include: { createdBy: { select: { id: true, name: true, email: true, image: true } } } });
  return goals.map((goal) => mapGoal(goal));
}

export async function getGoalById(id: string) {
  const ctx = await requirePermission("goals.read");
  const goal = await prisma.goal.findFirst({ where: { id, organizationId: ctx.tenantId }, include: { createdBy: { select: { id: true, name: true, email: true, image: true } } } });
  return goal ? mapGoal(goal) : null;
}

export async function createGoal(data: Record<string, unknown>) {
  const ctx = await requirePermission("goals.create");
  const title = getTitle(data);

  if (!title || title.trim() === "" || title.trim() === "Untitled") {
    throw new Error("Goal title is required and cannot be empty.");
  }

  const targetOutcome = typeof data.targetOutcome === "string" ? data.targetOutcome.trim() : "";
  if (!targetOutcome) {
    throw new Error("Target outcome is required and cannot be empty.");
  }

  const status = typeof data.status === "string" ? data.status.trim() : "";
  if (!status) {
    throw new Error("Planning status is required.");
  }

  const goal = await prisma.goal.create({
    data: {      organizationId: ctx.tenantId,
      title,
      targetOutcome,
      description: textValue(data.description),
      status: normalizeGoalStatus(getStatus(data)),
      priority: textValue(data.priority),
      progress: intValue(data.progress) ?? 0,
      startDate: dateValue(data.startDate),
      dueDate: dateValue(data.dueDate) ?? dateValue(data.targetDate),
      payload: goalPayload(data),
      createdById: ctx.userId,
      updatedById: ctx.userId,
    },
  });
  await logDomainActivity({ tenantId: ctx.tenantId, userId: ctx.userId, module: MODULE, action: "Created", entityType: ENTITY, entityId: goal.id, entityName: title, description: typeof data.description === "string" ? data.description : null });
  return mapGoal(goal, ctx.user);
}

export async function updateGoal(id: string, patch: Record<string, unknown>) {
  const ctx = await requirePermission("goals.update");
  const current = await prisma.goal.findFirst({ where: { id, organizationId: ctx.tenantId } });
  if (!current) return null;

  if (patch.title !== undefined || patch.name !== undefined) {
    const newTitle = getTitle(patch);
    if (!newTitle || newTitle.trim() === "" || newTitle.trim() === "Untitled") {
      throw new Error("Goal title cannot be empty.");
    }
  }

  if (patch.targetOutcome !== undefined) {
    const targetOutcome = typeof patch.targetOutcome === "string" ? patch.targetOutcome.trim() : "";
    if (!targetOutcome) {
      throw new Error("Target outcome cannot be empty.");
    }
  }

  if (patch.status !== undefined) {
    const status = typeof patch.status === "string" ? patch.status.trim() : "";
    if (!status) {
      throw new Error("Planning status cannot be empty.");
    }
  }

  const result = await prisma.goal.updateMany({
    where: { id, organizationId: ctx.tenantId },
    data: {
      title: getTitle(patch, current.title ?? "Untitled"),
      targetOutcome: patch.targetOutcome !== undefined ? textValue(patch.targetOutcome) : current.targetOutcome,
      description: patch.description !== undefined ? textValue(patch.description) : current.description,
      status: typeof patch.status === "string" ? normalizeGoalStatus(patch.status) : current.status,
      priority: patch.priority !== undefined ? textValue(patch.priority) : current.priority,
      progress: patch.progress !== undefined ? intValue(patch.progress) ?? current.progress : current.progress,
      startDate: patch.startDate !== undefined ? dateValue(patch.startDate) : current.startDate,
      dueDate: patch.dueDate !== undefined || patch.targetDate !== undefined ? dateValue(patch.dueDate) ?? dateValue(patch.targetDate) : current.dueDate,
      payload: goalPayload(patch, current.payload),
      updatedById: ctx.userId,
    },
  });
  if (result.count === 0) return null;
  const updated = await prisma.goal.findFirst({ where: { id, organizationId: ctx.tenantId }, include: { createdBy: { select: { id: true, name: true, email: true, image: true } } } });
  if (!updated) return null;
  await logDomainActivity({ tenantId: ctx.tenantId, userId: ctx.userId, module: MODULE, action: "Updated", entityType: ENTITY, entityId: id, entityName: updated.title, description: typeof patch.description === "string" ? patch.description : null });
  return mapGoal(updated);
}

export async function deleteGoal(id: string) {
  const ctx = await requirePermission("goals.delete");
  const current = await prisma.goal.findFirst({ where: { id, organizationId: ctx.tenantId } });
  if (!current) return null;
  const result = await prisma.goal.deleteMany({ where: { id, organizationId: ctx.tenantId } });
  if (result.count === 0) return null;
  await logDomainActivity({ tenantId: ctx.tenantId, userId: ctx.userId, module: MODULE, action: "Deleted", entityType: ENTITY, entityId: id, entityName: current.title });
  return { id };
}
