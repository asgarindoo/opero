import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/server/rbac";
import { getStatus, getTitle, logDomainActivity, mapDomainRecord } from "@/lib/api/domain-utils";

const MODULE = "FLOWS";
const ENTITY = "Flow";

function parseDate(value: unknown): Date | undefined {
  if (typeof value !== "string" || !value) return undefined;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? undefined : date;
}

function normalizeStage(stage: unknown, index: number) {
  const data = stage && typeof stage === "object" ? stage as Record<string, unknown> : {};
  const checklist = Array.isArray(data.checklist)
    ? data.checklist
        .filter((item) => item && typeof item === "object")
        .map((item, itemIndex) => {
          const value = item as Record<string, unknown>;
          return {
            id: typeof value.id === "string" && value.id ? value.id : `item-${index + 1}-${itemIndex + 1}`,
            text: typeof value.text === "string" ? value.text : "",
            isCompleted: Boolean(value.isCompleted),
          };
        })
    : [];

  return {
    id: typeof data.id === "string" && data.id ? data.id : `stage-${index + 1}`,
    name: typeof data.name === "string" && data.name.trim() ? data.name.trim() : `Stage ${index + 1}`,
    description: typeof data.description === "string" ? data.description : undefined,
    isCompleted: typeof data.isCompleted === "boolean" ? data.isCompleted : data.status === "Done",
    checklist,
    order: typeof data.order === "number" ? data.order : index,
  };
}

function normalizeStages(value: unknown) {
  return Array.isArray(value) ? value.map(normalizeStage) : [];
}

function flowColumns(data: Record<string, unknown>, current: Record<string, unknown> = {}) {
  const merged = { ...current, ...data };
  return {
    name: getTitle(merged),
    category: typeof merged.category === "string" && merged.category ? merged.category : "Operations",
    description: typeof merged.description === "string" ? merged.description : null,
    progress: typeof merged.progress === "number" ? merged.progress : 0,
    stages: normalizeStages(merged.stages),
    notes: Array.isArray(merged.notes) ? merged.notes : [],
    dueDate: parseDate(merged.dueDate),
  };
}

export async function listFlows() {
  const ctx = await requirePermission("flows.read");
  const flows = await prisma.flow.findMany({
    where: { organizationId: ctx.tenantId },
    orderBy: { createdAt: "desc" },
    include: { createdBy: { select: { id: true, name: true, email: true, image: true } } },
  });
  return flows.map((flow) => mapDomainRecord(flow));
}

export async function getFlowById(id: string) {
  const ctx = await requirePermission("flows.read");
  const flow = await prisma.flow.findFirst({
    where: { id, organizationId: ctx.tenantId },
    include: { createdBy: { select: { id: true, name: true, email: true, image: true } } },
  });
  return flow ? mapDomainRecord(flow) : null;
}

export async function createFlow(data: Record<string, unknown>) {
  const ctx = await requirePermission("flows.create");
  const title = getTitle(data);
  
  if (!title || title.trim() === "" || title.trim() === "Untitled") {
    throw new Error("Flow name is required and cannot be empty.");
  }

  const stages = Array.isArray(data.stages) ? data.stages : [];
  if (stages.length === 0) {
    throw new Error("At least one stage is required.");
  }

  for (let i = 0; i < stages.length; i++) {
    const s = stages[i];
    if (!s || typeof s !== "object" || !s.name || !s.name.trim()) {
      throw new Error(`Stage ${i + 1} name is required.`);
    }
  }

  const flow = await prisma.flow.create({
    data: {      organizationId: ctx.tenantId,
      title,
      status: getStatus(data, "Active"),
      ...flowColumns(data),
      createdById: ctx.userId,
      updatedById: ctx.userId,
    },
  });
  await logDomainActivity({ tenantId: ctx.tenantId, userId: ctx.userId, module: MODULE, action: "Created", entityType: ENTITY, entityId: flow.id, entityName: title, description: typeof data.description === "string" ? data.description : null });
  return mapDomainRecord(flow, ctx.user);
}

export async function updateFlow(id: string, patch: Record<string, unknown>) {
  const ctx = await requirePermission("flows.update");
  const current = await prisma.flow.findFirst({ where: { id, organizationId: ctx.tenantId } });
  if (!current) return null;

  if (patch.name !== undefined || patch.title !== undefined) {
    const newTitle = getTitle(patch);
    if (!newTitle || newTitle.trim() === "" || newTitle.trim() === "Untitled") {
      throw new Error("Flow name cannot be empty.");
    }
  }

  if (patch.stages !== undefined) {
    const stages = Array.isArray(patch.stages) ? patch.stages : [];
    if (stages.length === 0) {
      throw new Error("At least one stage is required.");
    }
    for (let i = 0; i < stages.length; i++) {
      const s = stages[i];
      if (!s || typeof s !== "object" || !s.name || !s.name.trim()) {
        throw new Error(`Stage ${i + 1} name is required.`);
      }
    }
  }

  const result = await prisma.flow.updateMany({
    where: { id, organizationId: ctx.tenantId },
    data: { title: getTitle(patch, current.title ?? "Untitled"), status: typeof patch.status === "string" ? patch.status : current.status, ...flowColumns(patch, current as unknown as Record<string, unknown>), updatedById: ctx.userId },
  });
  if (result.count === 0) return null;
  const updated = await prisma.flow.findFirst({ where: { id, organizationId: ctx.tenantId }, include: { createdBy: { select: { id: true, name: true, email: true, image: true } } } });
  if (!updated) return null;
  await logDomainActivity({ tenantId: ctx.tenantId, userId: ctx.userId, module: MODULE, action: "Updated", entityType: ENTITY, entityId: id, entityName: updated.title, description: typeof patch.description === "string" ? patch.description : null });
  return mapDomainRecord(updated);
}

export async function deleteFlow(id: string) {
  const ctx = await requirePermission("flows.delete");
  const current = await prisma.flow.findFirst({ where: { id, organizationId: ctx.tenantId } });
  if (!current) return null;
  const result = await prisma.flow.deleteMany({ where: { id, organizationId: ctx.tenantId } });
  if (result.count === 0) return null;
  await logDomainActivity({ tenantId: ctx.tenantId, userId: ctx.userId, module: MODULE, action: "Deleted", entityType: ENTITY, entityId: id, entityName: current.title });
  return { id };
}
