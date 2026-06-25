import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/server/rbac";
import { getStatus, getTitle, logDomainActivity, mapDomainRecord } from "@/lib/api/domain-utils";
import { deletePrivateObject, TENANT_FILES_BUCKET } from "@/lib/server/supabase-storage";
import { intValue, jsonArray, jsonInputOrDefault, textValue } from "@/lib/api/feature-records";

const MODULE = "DOCUMENTS";

async function resolveFolderId(tenantId: string, value: unknown) {
  if (value === null) return null;
  const folderId = textValue(value);
  if (!folderId) return undefined;
  const folder = await prisma.folder.findFirst({
    where: { id: folderId, organizationId: tenantId },
    select: { id: true },
  });
  return folder?.id ?? null;
}

async function resolveParentFolderId(tenantId: string, value: unknown, currentId?: string) {
  if (value === null) return null;
  const parentId = textValue(value);
  if (!parentId || parentId === currentId) return null;
  const folder = await prisma.folder.findFirst({
    where: { id: parentId, organizationId: tenantId },
    select: { id: true },
  });
  return folder?.id ?? null;
}

async function buildDocumentCreateData(tenantId: string, userId: string, data: Record<string, unknown>) {
  const fileUrl = textValue(data.fileUrl) ?? textValue(data.downloadUrl);
  const downloadUrl = textValue(data.downloadUrl) ?? textValue(data.fileUrl);

  return {
    title: getTitle(data),
    description: textValue(data.description),
    status: getStatus(data, "Active"),
    fileName: textValue(data.fileName),
    fileType: textValue(data.fileType),
    fileSize: intValue(data.fileSize),
    storagePath: textValue(data.storagePath),
    fileUrl,
    downloadUrl,
    folderId: await resolveFolderId(tenantId, data.folderId),
    tags: jsonArray(data.tags),
    uploadedById: textValue(data.uploadedById) ?? userId,
  };
}

export async function listDocuments() {
  const ctx = await requirePermission("documents.read");
  const documents = await prisma.document.findMany({ where: { organizationId: ctx.tenantId }, orderBy: { createdAt: "desc" }, include: { createdBy: { select: { id: true, name: true, email: true, image: true } } } });
  return documents.map((document) => mapDomainRecord(document));
}

export async function getDocumentById(id: string) {
  const ctx = await requirePermission("documents.read");
  const document = await prisma.document.findFirst({ where: { id, organizationId: ctx.tenantId }, include: { createdBy: { select: { id: true, name: true, email: true, image: true } } } });
  return document ? mapDomainRecord(document) : null;
}

export async function createDocument(data: Record<string, unknown>) {
  const ctx = await requirePermission("documents.create");
  const documentData = await buildDocumentCreateData(ctx.tenantId, ctx.userId, data);
  const document = await prisma.document.create({
    data: {      organizationId: ctx.tenantId,
      ...documentData,
      createdById: ctx.userId,
      updatedById: ctx.userId,
    },
  });
  await logDomainActivity({ tenantId: ctx.tenantId, userId: ctx.userId, module: MODULE, action: "Created", entityType: "Document", entityId: document.id, entityName: document.title, description: document.description });
  return mapDomainRecord(document, ctx.user);
}

export async function updateDocument(id: string, patch: Record<string, unknown>) {
  const ctx = await requirePermission("documents.update");
  const current = await prisma.document.findFirst({ where: { id, organizationId: ctx.tenantId } });
  if (!current) return null;
  const folderId = patch.folderId !== undefined ? await resolveFolderId(ctx.tenantId, patch.folderId) : current.folderId;
  const updated = await prisma.document.update({
    where: { id },
    data: {
      title: getTitle(patch, current.title ?? "Untitled"),
      description: patch.description !== undefined ? textValue(patch.description) : current.description,
      status: typeof patch.status === "string" ? patch.status : current.status,
      fileName: patch.fileName !== undefined ? textValue(patch.fileName) : current.fileName,
      fileType: patch.fileType !== undefined ? textValue(patch.fileType) : current.fileType,
      fileSize: patch.fileSize !== undefined ? intValue(patch.fileSize) : current.fileSize,
      storagePath: patch.storagePath !== undefined ? textValue(patch.storagePath) : current.storagePath,
      fileUrl: patch.fileUrl !== undefined || patch.downloadUrl !== undefined ? textValue(patch.fileUrl) ?? textValue(patch.downloadUrl) : current.fileUrl,
      downloadUrl: patch.downloadUrl !== undefined || patch.fileUrl !== undefined ? textValue(patch.downloadUrl) ?? textValue(patch.fileUrl) : current.downloadUrl,
      folderId,
      tags: patch.tags !== undefined ? jsonArray(patch.tags) : jsonInputOrDefault(current.tags, []),
      uploadedById: patch.uploadedById !== undefined ? textValue(patch.uploadedById) : current.uploadedById,
      updatedById: ctx.userId,
    },
    include: { createdBy: { select: { id: true, name: true, email: true, image: true } } },
  });
  await logDomainActivity({ tenantId: ctx.tenantId, userId: ctx.userId, module: MODULE, action: "Updated", entityType: "Document", entityId: id, entityName: updated.title, description: updated.description });
  return mapDomainRecord(updated);
}

export async function deleteDocument(id: string) {
  const ctx = await requirePermission("documents.delete");
  const current = await prisma.document.findFirst({ where: { id, organizationId: ctx.tenantId } });
  if (!current) return null;
  const result = await prisma.document.deleteMany({ where: { id, organizationId: ctx.tenantId } });
  if (result.count === 0) return null;
  
  const storagePath = current.storagePath;
  if (storagePath) {
    try {
      await deletePrivateObject(TENANT_FILES_BUCKET, storagePath);
    } catch (err) {
      console.error(`Failed to delete storage object for document ${id}:`, err);
    }
  }

  await logDomainActivity({ tenantId: ctx.tenantId, userId: ctx.userId, module: MODULE, action: "Deleted", entityType: "Document", entityId: id, entityName: current.title });
  return { id };
}

export async function listFolders() {
  const ctx = await requirePermission("documentFolders.read");
  const folders = await prisma.folder.findMany({ where: { organizationId: ctx.tenantId }, orderBy: { createdAt: "desc" }, include: { createdBy: { select: { id: true, name: true, email: true, image: true } } } });
  return folders.map((folder) => mapDomainRecord(folder));
}

export async function getFolderById(id: string) {
  const ctx = await requirePermission("documentFolders.read");
  const folder = await prisma.folder.findFirst({ where: { id, organizationId: ctx.tenantId }, include: { createdBy: { select: { id: true, name: true, email: true, image: true } } } });
  return folder ? mapDomainRecord(folder) : null;
}

export async function createFolder(data: Record<string, unknown>) {
  const ctx = await requirePermission("documentFolders.create");
  const title = getTitle(data);
  const parentId = await resolveParentFolderId(ctx.tenantId, data.parentId);
  const folder = await prisma.folder.create({
    data: {      organizationId: ctx.tenantId,
      title,
      name: textValue(data.name) ?? title,
      description: textValue(data.description),
      status: getStatus(data, "Active"),
      parentId,
      color: textValue(data.color),
      sortOrder: intValue(data.sortOrder) ?? 0,
      tags: jsonArray(data.tags),
      createdById: ctx.userId,
      updatedById: ctx.userId,
    },
  });
  await logDomainActivity({ tenantId: ctx.tenantId, userId: ctx.userId, module: MODULE, action: "Created", entityType: "Folder", entityId: folder.id, entityName: title, description: typeof data.description === "string" ? data.description : null });
  return mapDomainRecord(folder, ctx.user);
}

export async function updateFolder(id: string, patch: Record<string, unknown>) {
  const ctx = await requirePermission("documentFolders.update");
  const current = await prisma.folder.findFirst({ where: { id, organizationId: ctx.tenantId } });
  if (!current) return null;
  const title = getTitle(patch, current.title ?? "Untitled");
  const parentId = patch.parentId !== undefined ? await resolveParentFolderId(ctx.tenantId, patch.parentId, id) : current.parentId;
  const result = await prisma.folder.updateMany({
    where: { id, organizationId: ctx.tenantId },
    data: {
      title,
      name: patch.name !== undefined ? textValue(patch.name) ?? title : current.name,
      description: patch.description !== undefined ? textValue(patch.description) : current.description,
      status: typeof patch.status === "string" ? patch.status : current.status,
      parentId,
      color: patch.color !== undefined ? textValue(patch.color) : current.color,
      sortOrder: patch.sortOrder !== undefined ? intValue(patch.sortOrder) ?? current.sortOrder : current.sortOrder,
      tags: patch.tags !== undefined ? jsonArray(patch.tags) : jsonInputOrDefault(current.tags, []),
      updatedById: ctx.userId,
    },
  });
  if (result.count === 0) return null;
  const updated = await prisma.folder.findFirst({ where: { id, organizationId: ctx.tenantId }, include: { createdBy: { select: { id: true, name: true, email: true, image: true } } } });
  if (!updated) return null;
  await logDomainActivity({ tenantId: ctx.tenantId, userId: ctx.userId, module: MODULE, action: "Updated", entityType: "Folder", entityId: id, entityName: updated.title, description: typeof patch.description === "string" ? patch.description : null });
  return mapDomainRecord(updated);
}

export async function deleteFolder(id: string) {
  const ctx = await requirePermission("documentFolders.delete");
  const current = await prisma.folder.findFirst({ where: { id, organizationId: ctx.tenantId } });
  if (!current) return null;
  const result = await prisma.folder.deleteMany({ where: { id, organizationId: ctx.tenantId } });
  if (result.count === 0) return null;
  await logDomainActivity({ tenantId: ctx.tenantId, userId: ctx.userId, module: MODULE, action: "Deleted", entityType: "Folder", entityId: id, entityName: current.title });
  return { id };
}
