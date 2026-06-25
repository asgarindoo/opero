import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/server/rbac";
import { getStatus, getTitle, logDomainActivity, mapDomainRecord } from "@/lib/api/domain-utils";
import { dateValue, numberValue, textValue } from "@/lib/api/feature-records";

const MODULE = "FINANCE";
const ENTITY = "Transaction";

function buildTransactionCreateData(data: Record<string, unknown>) {
  return {
    type: textValue(data.type) ?? "Expense",
    title: getTitle(data),
    amount: numberValue(data.amount) ?? 0,
    currency: textValue(data.currency) ?? "USD",
    category: textValue(data.category) ?? "General",
    transactionDate: dateValue(data.transactionDate),
    paymentMethod: textValue(data.paymentMethod),
    reference: textValue(data.reference),
    sourceType: textValue(data.sourceType) ?? "Manual",
    sourceId: textValue(data.sourceId),
    status: getStatus(data, "Pending"),
    contactName: textValue(data.contactName),
    contactId: textValue(data.contactId),
    notes: textValue(data.notes),
  };
}

export async function listTransactions() {
  const ctx = await requirePermission("finance.read");
  const transactions = await prisma.transaction.findMany({ where: { organizationId: ctx.tenantId }, orderBy: { createdAt: "desc" }, include: { createdBy: { select: { id: true, name: true, email: true, image: true } } } });
  return transactions.map((transaction) => mapDomainRecord(transaction));
}

export async function getTransactionById(id: string) {
  const ctx = await requirePermission("finance.read");
  const transaction = await prisma.transaction.findFirst({ where: { id, organizationId: ctx.tenantId }, include: { createdBy: { select: { id: true, name: true, email: true, image: true } } } });
  return transaction ? mapDomainRecord(transaction) : null;
}

export async function createTransaction(data: Record<string, unknown>) {
  const ctx = await requirePermission("finance.create");
  const transactionData = buildTransactionCreateData(data);
  const transaction = await prisma.transaction.create({
    data: {      organizationId: ctx.tenantId,
      ...transactionData,
      createdById: ctx.userId,
      updatedById: ctx.userId,
    },
  });
  await logDomainActivity({ tenantId: ctx.tenantId, userId: ctx.userId, module: MODULE, action: "Created", entityType: ENTITY, entityId: transaction.id, entityName: transaction.title, description: transaction.notes });
  return mapDomainRecord(transaction, ctx.user);
}

export async function updateTransaction(id: string, patch: Record<string, unknown>) {
  const ctx = await requirePermission("finance.update");
  const current = await prisma.transaction.findFirst({ where: { id, organizationId: ctx.tenantId } });
  if (!current) return null;
  const updated = await prisma.transaction.update({
    where: { id },
    data: {
      type: patch.type !== undefined ? textValue(patch.type) : current.type,
      title: getTitle(patch, current.title ?? "Untitled"),
      amount: patch.amount !== undefined ? numberValue(patch.amount) ?? current.amount : current.amount,
      currency: patch.currency !== undefined ? textValue(patch.currency) ?? current.currency : current.currency,
      category: patch.category !== undefined ? textValue(patch.category) : current.category,
      transactionDate: patch.transactionDate !== undefined ? dateValue(patch.transactionDate) : current.transactionDate,
      paymentMethod: patch.paymentMethod !== undefined ? textValue(patch.paymentMethod) : current.paymentMethod,
      reference: patch.reference !== undefined ? textValue(patch.reference) : current.reference,
      sourceType: patch.sourceType !== undefined ? textValue(patch.sourceType) : current.sourceType,
      sourceId: patch.sourceId !== undefined ? textValue(patch.sourceId) : current.sourceId,
      status: typeof patch.status === "string" ? patch.status : current.status,
      contactName: patch.contactName !== undefined ? textValue(patch.contactName) : current.contactName,
      contactId: patch.contactId !== undefined ? textValue(patch.contactId) : current.contactId,
      notes: patch.notes !== undefined ? textValue(patch.notes) : current.notes,
      updatedById: ctx.userId,
    },
    include: { createdBy: { select: { id: true, name: true, email: true, image: true } } },
  });
  await logDomainActivity({ tenantId: ctx.tenantId, userId: ctx.userId, module: MODULE, action: "Updated", entityType: ENTITY, entityId: id, entityName: updated.title, description: updated.notes });
  return mapDomainRecord(updated);
}

export async function deleteTransaction(id: string) {
  const ctx = await requirePermission("finance.delete");
  const current = await prisma.transaction.findFirst({ where: { id, organizationId: ctx.tenantId } });
  if (!current) return null;
  const result = await prisma.transaction.deleteMany({ where: { id, organizationId: ctx.tenantId } });
  if (result.count === 0) return null;
  await logDomainActivity({ tenantId: ctx.tenantId, userId: ctx.userId, module: MODULE, action: "Deleted", entityType: ENTITY, entityId: id, entityName: current.title });
  return { id };
}
