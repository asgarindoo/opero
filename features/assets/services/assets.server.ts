import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/server/rbac";
import { getStatus, getTitle, logDomainActivity, mapDomainRecord } from "@/lib/api/domain-utils";
import { dateValue, intValue, jsonArray, jsonInputOrDefault, numberValue, textValue } from "@/lib/api/feature-records";

const MODULE = "DOCUMENTS";
const ENTITY = "Asset";

function mapAsset(record: any, fallbackUser?: { id: string; name: string; email?: string | null; image?: string | null }) {
  const mapped = mapDomainRecord(record, fallbackUser) as any;
  return {
    ...mapped,
    activities: Array.isArray(mapped.activities) ? mapped.activities : [],
    comments: Array.isArray(mapped.comments) ? mapped.comments : [],
  };
}

function buildAssetCreateData(data: Record<string, unknown>) {
  const name = textValue(data.name) ?? getTitle(data);

  return {
    title: name,
    name,
    category: textValue(data.category),
    assetCode: textValue(data.assetCode),
    quantity: intValue(data.quantity) ?? 1,
    status: getStatus(data, "Active"),
    location: textValue(data.location),
    purchaseDate: dateValue(data.purchaseDate),
    purchaseValue: numberValue(data.purchaseValue),
    currency: textValue(data.currency),
    warrantyExpiry: dateValue(data.warrantyExpiry),
    supplierName: textValue(data.supplierName) ?? textValue(data.supplier),
    imageUrl: textValue(data.imageUrl),
    activities: jsonArray(data.activities),
    comments: jsonArray(data.comments),
  };
}

export async function listAssets() {
  const ctx = await requirePermission("assets.read");
  const assets = await prisma.asset.findMany({ where: { organizationId: ctx.tenantId }, orderBy: { createdAt: "desc" }, include: { createdBy: { select: { id: true, name: true, email: true, image: true } } } });
  return assets.map((asset) => mapAsset(asset));
}

export async function getAssetById(id: string) {
  const ctx = await requirePermission("assets.read");
  const asset = await prisma.asset.findFirst({ where: { id, organizationId: ctx.tenantId }, include: { createdBy: { select: { id: true, name: true, email: true, image: true } } } });
  return asset ? mapAsset(asset) : null;
}

export async function createAsset(data: Record<string, unknown>) {
  const ctx = await requirePermission("assets.create");
  const assetData = buildAssetCreateData(data);
  const asset = await prisma.asset.create({
    data: {      organizationId: ctx.tenantId,
      ...assetData,
      createdById: ctx.userId,
      updatedById: ctx.userId,
    },
  });
  await logDomainActivity({ tenantId: ctx.tenantId, userId: ctx.userId, module: MODULE, action: "Created", entityType: ENTITY, entityId: asset.id, entityName: asset.name ?? asset.title });
  return mapAsset(asset, ctx.user);
}

export async function updateAsset(id: string, patch: Record<string, unknown>) {
  const ctx = await requirePermission("assets.update");
  const current = await prisma.asset.findFirst({ where: { id, organizationId: ctx.tenantId } });
  if (!current) return null;
  const name = textValue(patch.name) ?? textValue(patch.title) ?? current.name ?? current.title ?? "Untitled";
  const updated = await prisma.asset.update({
    where: { id },
    data: {
      title: name,
      name,
      category: patch.category !== undefined ? textValue(patch.category) : current.category,
      assetCode: patch.assetCode !== undefined ? textValue(patch.assetCode) : current.assetCode,
      quantity: patch.quantity !== undefined ? intValue(patch.quantity) ?? current.quantity : current.quantity,
      status: typeof patch.status === "string" ? patch.status : current.status,
      location: patch.location !== undefined ? textValue(patch.location) : current.location,
      purchaseDate: patch.purchaseDate !== undefined ? dateValue(patch.purchaseDate) : current.purchaseDate,
      purchaseValue: patch.purchaseValue !== undefined ? numberValue(patch.purchaseValue) : current.purchaseValue,
      currency: patch.currency !== undefined ? textValue(patch.currency) : current.currency,
      warrantyExpiry: patch.warrantyExpiry !== undefined ? dateValue(patch.warrantyExpiry) : current.warrantyExpiry,
      supplierName: patch.supplierName !== undefined || patch.supplier !== undefined ? textValue(patch.supplierName) ?? textValue(patch.supplier) : current.supplierName,
      imageUrl: patch.imageUrl !== undefined ? textValue(patch.imageUrl) : current.imageUrl,
      activities: patch.activities !== undefined ? jsonArray(patch.activities) : jsonInputOrDefault(current.activities, []),
      comments: patch.comments !== undefined ? jsonArray(patch.comments) : jsonInputOrDefault(current.comments, []),
      updatedById: ctx.userId,
    },
    include: { createdBy: { select: { id: true, name: true, email: true, image: true } } },
  });
  await logDomainActivity({ tenantId: ctx.tenantId, userId: ctx.userId, module: MODULE, action: "Updated", entityType: ENTITY, entityId: id, entityName: updated.name ?? updated.title });
  return mapAsset(updated);
}

export async function deleteAsset(id: string) {
  const ctx = await requirePermission("assets.delete");
  const current = await prisma.asset.findFirst({ where: { id, organizationId: ctx.tenantId } });
  if (!current) return null;
  const result = await prisma.asset.deleteMany({ where: { id, organizationId: ctx.tenantId } });
  if (result.count === 0) return null;
  await logDomainActivity({ tenantId: ctx.tenantId, userId: ctx.userId, module: MODULE, action: "Deleted", entityType: ENTITY, entityId: id, entityName: current.title });
  return { id };
}
