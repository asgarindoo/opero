import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/server/rbac";
import { getStatus, getTitle, logDomainActivity, mapDomainRecord } from "@/lib/api/domain-utils";
import { dateValue, jsonArray, jsonInputOrDefault, numberValue, textValue } from "@/lib/api/feature-records";

const MODULE = "MARKETING";
const ENTITY = "Campaign";

function buildCampaignCreateData(data: Record<string, unknown>) {
  const name = textValue(data.name) ?? getTitle(data);

  return {
    title: name,
    name,
    description: textValue(data.description),
    status: getStatus(data),
    priority: textValue(data.priority),
    startDate: dateValue(data.startDate),
    endDate: dateValue(data.endDate),
    budget: numberValue(data.budget),
    currency: textValue(data.currency),
    tags: jsonArray(data.tags),
    campaignAccounts: jsonArray(data.campaignAccounts),
    activities: jsonArray(data.activities),
  };
}

export async function listCampaigns() {
  const ctx = await requirePermission("campaigns.read");
  const campaigns = await prisma.campaign.findMany({ where: { organizationId: ctx.tenantId }, orderBy: { createdAt: "desc" }, include: { createdBy: { select: { id: true, name: true, email: true, image: true } } } });
  return campaigns.map((campaign: any) => mapDomainRecord(campaign));
}

export async function getCampaignById(id: string) {
  const ctx = await requirePermission("campaigns.read");
  const campaign = await prisma.campaign.findFirst({ where: { id, organizationId: ctx.tenantId }, include: { createdBy: { select: { id: true, name: true, email: true, image: true } } } });
  return campaign ? mapDomainRecord(campaign) : null;
}

export async function createCampaign(data: Record<string, unknown>) {
  const ctx = await requirePermission("campaigns.create");
  const campaignData = buildCampaignCreateData(data);
  const campaign = await prisma.campaign.create({
    data: {      organizationId: ctx.tenantId,
      ...campaignData,
      createdById: ctx.userId,
      updatedById: ctx.userId,
    },
  });
  await logDomainActivity({ tenantId: ctx.tenantId, userId: ctx.userId, module: MODULE, action: "Created", entityType: ENTITY, entityId: campaign.id, entityName: campaign.name ?? campaign.title, description: campaign.description });
  return mapDomainRecord(campaign, ctx.user);
}

export async function updateCampaign(id: string, patch: Record<string, unknown>) {
  const ctx = await requirePermission("campaigns.update");
  const current = await prisma.campaign.findFirst({ where: { id, organizationId: ctx.tenantId } });
  if (!current) return null;
  const name = textValue(patch.name) ?? textValue(patch.title) ?? current.name ?? current.title ?? "Untitled";
  const updated = await prisma.campaign.update({
    where: { id },
    data: {
      title: name,
      name,
      description: patch.description !== undefined ? textValue(patch.description) : current.description,
      status: typeof patch.status === "string" ? patch.status : current.status,
      priority: patch.priority !== undefined ? textValue(patch.priority) : current.priority,
      startDate: patch.startDate !== undefined ? dateValue(patch.startDate) : current.startDate,
      endDate: patch.endDate !== undefined ? dateValue(patch.endDate) : current.endDate,
      budget: patch.budget !== undefined ? numberValue(patch.budget) : current.budget,
      currency: patch.currency !== undefined ? textValue(patch.currency) : current.currency,
      tags: patch.tags !== undefined ? jsonArray(patch.tags) : jsonInputOrDefault(current.tags, []),
      campaignAccounts: patch.campaignAccounts !== undefined ? jsonArray(patch.campaignAccounts) : jsonInputOrDefault(current.campaignAccounts, []),
      activities: patch.activities !== undefined ? jsonArray(patch.activities) : jsonInputOrDefault(current.activities, []),
      updatedById: ctx.userId,
    },
    include: { createdBy: { select: { id: true, name: true, email: true, image: true } } },
  });
  await logDomainActivity({ tenantId: ctx.tenantId, userId: ctx.userId, module: MODULE, action: "Updated", entityType: ENTITY, entityId: id, entityName: updated.name ?? updated.title, description: updated.description });
  return mapDomainRecord(updated);
}

export async function deleteCampaign(id: string) {
  const ctx = await requirePermission("campaigns.delete");
  const current = await prisma.campaign.findFirst({ where: { id, organizationId: ctx.tenantId } });
  if (!current) return null;
  const result = await prisma.campaign.deleteMany({ where: { id, organizationId: ctx.tenantId } });
  if (result.count === 0) return null;
  await logDomainActivity({ tenantId: ctx.tenantId, userId: ctx.userId, module: MODULE, action: "Deleted", entityType: ENTITY, entityId: id, entityName: current.title });
  return { id };
}
