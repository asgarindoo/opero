import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/server/rbac";
import { getStatus, getTitle, logDomainActivity, mapDomainRecord, parsePayload } from "@/lib/api/domain-utils";
import { jsonArray, jsonInputOrDefault, jsonObjectOrUndefined, textValue } from "@/lib/api/feature-records";
import { contactSchema } from "../validators";

const MODULE = "TEAM";
const ENTITY = "Contact";

const CONTACT_SELECT = {
  id: true,
  organizationId: true,
  title: true,
  status: true,
  payload: true,
  createdById: true,
  updatedById: true,
  createdAt: true,
  updatedAt: true,
  industry: true,
  name: true,
  persons: true,
  comments: true,
  relationshipType: true,
  createdBy: { select: { id: true, name: true, email: true, image: true } },
} as const;

function contactPayload(data: Record<string, unknown>, currentPayload?: unknown) {
  const payload = { ...parsePayload(currentPayload) };
  delete payload.comments;
  if (data.contextData !== undefined) payload.contextData = data.contextData;
  if (data.lastContacted !== undefined) payload.lastContacted = data.lastContacted;
  if (data.isArchived !== undefined) payload.isArchived = data.isArchived;
  return jsonObjectOrUndefined(payload) ?? {};
}

function mapContact(record: any, fallbackUser?: { id: string; name: string; email?: string | null; image?: string | null }) {
  const mapped = mapDomainRecord(record, fallbackUser) as any;
  const payload = parsePayload(record.payload);
  return {
    ...mapped,
    relationshipType: mapped.relationshipType ?? "Lead",
    status: mapped.status ?? "New",
    industry: mapped.industry ?? "Unspecified",
    contextData: payload.contextData && typeof payload.contextData === "object" && !Array.isArray(payload.contextData) ? payload.contextData : {},
    persons: Array.isArray(mapped.persons) ? mapped.persons : [],
    comments: Array.isArray(mapped.comments) ? mapped.comments : [],
    isArchived: mapped.isArchived ?? mapped.status === "Archived",
    createdAt: mapped.createdAt ?? mapped.recordCreatedAt ?? "",
    lastContacted: typeof payload.lastContacted === "string" ? payload.lastContacted : mapped.recordUpdatedAt ?? mapped.recordCreatedAt ?? "",
  };
}

function sanitizePersons(value: unknown) {
  if (!Array.isArray(value)) return undefined;
  return value
    .filter((person) => person && typeof person === "object")
    .map((person, index) => {
      const data = person as Record<string, unknown>;
      const name = textValue(data.name) ?? "Contact Person";
      return {
        id: textValue(data.id) ?? `person-${Date.now()}-${index}`,
        name,
        email: textValue(data.email) ?? "",
        phone: textValue(data.phone) ?? "",
        role: textValue(data.role) ?? "Contact Person",
        isPrimary: Boolean(data.isPrimary),
      };
    });
}

export async function listContacts() {
  const ctx = await requirePermission("contacts.read");
  const contacts = await prisma.contact.findMany({ where: { organizationId: ctx.tenantId }, orderBy: { createdAt: "desc" }, select: CONTACT_SELECT });
  return contacts.map((contact) => mapContact(contact));
}

export async function getContactById(id: string) {
  const ctx = await requirePermission("contacts.read");
  const contact = await prisma.contact.findFirst({ where: { id, organizationId: ctx.tenantId }, select: CONTACT_SELECT });
  return contact ? mapContact(contact) : null;
}

export async function createContact(data: Record<string, unknown>) {
  const ctx = await requirePermission("contacts.create");
  const parsed = contactSchema.parse(data);
  const title = getTitle(parsed);
  const contact = await prisma.contact.create({
    data: {      organizationId: ctx.tenantId,
      title,
      name: textValue(parsed.name) ?? title,
      relationshipType: textValue(parsed.relationshipType),
      status: getStatus(parsed),
      industry: textValue(parsed.industry),
      persons: jsonArray(sanitizePersons(parsed.persons) ?? parsed.persons),
      comments: jsonArray(parsed.comments),
      payload: contactPayload(parsed),
      createdById: ctx.userId,
      updatedById: ctx.userId,
    },
    select: CONTACT_SELECT,
  });
  await logDomainActivity({ tenantId: ctx.tenantId, userId: ctx.userId, module: MODULE, action: "Created", entityType: ENTITY, entityId: contact.id, entityName: title });
  return mapContact(contact, ctx.user);
}

export async function updateContact(id: string, patch: Record<string, unknown>) {
  const ctx = await requirePermission("contacts.update");
  const current = await prisma.contact.findFirst({ where: { id, organizationId: ctx.tenantId }, select: CONTACT_SELECT });
  if (!current) return null;

  const parsed = contactSchema.partial().parse(patch);
  const title = getTitle(parsed, current.title ?? "Untitled");
  const result = await prisma.contact.updateMany({
    where: { id, organizationId: ctx.tenantId },
    data: {
      title,
      name: parsed.name !== undefined ? textValue(parsed.name) ?? title : current.name,
      relationshipType: parsed.relationshipType !== undefined ? textValue(parsed.relationshipType) : current.relationshipType,
      status: parsed.status !== undefined ? getStatus(parsed, current.status ?? "Active") : current.status,
      industry: parsed.industry !== undefined ? textValue(parsed.industry) : current.industry,
      persons: parsed.persons !== undefined ? jsonArray(sanitizePersons(parsed.persons) ?? parsed.persons) : jsonInputOrDefault(current.persons, []),
      comments: parsed.comments !== undefined ? jsonArray(parsed.comments) : jsonInputOrDefault(current.comments, []),
      payload: contactPayload(parsed, current.payload),
      updatedById: ctx.userId,
    },
  });
  if (result.count === 0) return null;
  const updated = await prisma.contact.findFirst({ where: { id, organizationId: ctx.tenantId }, select: CONTACT_SELECT });
  if (!updated) return null;
  await logDomainActivity({ tenantId: ctx.tenantId, userId: ctx.userId, module: MODULE, action: "Updated", entityType: ENTITY, entityId: id, entityName: updated.title });
  return mapContact(updated);
}

export async function deleteContact(id: string) {
  const ctx = await requirePermission("contacts.delete");
  const current = await prisma.contact.findFirst({ where: { id, organizationId: ctx.tenantId }, select: { title: true } });
  if (!current) return null;
  const result = await prisma.contact.deleteMany({ where: { id, organizationId: ctx.tenantId } });
  if (result.count === 0) return null;
  await logDomainActivity({ tenantId: ctx.tenantId, userId: ctx.userId, module: MODULE, action: "Deleted", entityType: ENTITY, entityId: id, entityName: current.title });
  return { id };
}
