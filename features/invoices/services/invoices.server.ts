import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/server/rbac";
import { getStatus, getTitle, logDomainActivity, mapDomainRecord, parsePayload } from "@/lib/api/domain-utils";
import { dateValue, jsonArray, jsonInputOrDefault, jsonObjectOrUndefined, numberValue, textValue } from "@/lib/api/feature-records";

const MODULE = "FINANCE";
const ENTITY = "Invoice";

const INVOICE_SELECT = {
  id: true,
  organizationId: true,
  invoiceNumber: true,
  title: true,
  status: true,
  contactName: true,
  contactId: true,
  contactEmail: true,
  issueDate: true,
  dueDate: true,
  items: true,
  subtotal: true,
  discountAmount: true,
  discountRate: true,
  discountTotal: true,
  taxRate: true,
  taxAmount: true,
  taxTotal: true,
  totalAmount: true,
  currency: true,
  paymentStatus: true,
  paymentMethod: true,
  saleId: true,
  payload: true,
  createdById: true,
  updatedById: true,
  createdAt: true,
  updatedAt: true,
  createdBy: { select: { id: true, name: true, email: true, image: true } },
} as const;

function invoicePayload(data: Record<string, unknown>, currentPayload?: unknown) {
  const payload = { ...parsePayload(currentPayload), ...parsePayload(data.payload) };
  delete payload.contactEmail;
  delete payload.recipientEmail;
  if (data.recipientName !== undefined) payload.recipientName = textValue(data.recipientName);
  return jsonObjectOrUndefined(payload) ?? {};
}

function mapInvoice(record: any, fallbackUser?: { id: string; name: string; email?: string | null; image?: string | null }) {
  const mapped = mapDomainRecord(record, fallbackUser) as any;
  const payload = parsePayload(record.payload);
  const contactEmail = textValue(mapped.contactEmail);
  return {
    ...mapped,
    contactName: mapped.contactName ?? mapped.recipientName ?? payload.contactName ?? payload.recipientName,
    contactEmail,
    grandTotal: mapped.grandTotal ?? mapped.totalAmount,
  };
}

export async function listInvoices() {
  const ctx = await requirePermission("invoices.read");
  const invoices = await prisma.invoice.findMany({
    where: { organizationId: ctx.tenantId },
    orderBy: { createdAt: "desc" },
    select: INVOICE_SELECT,
  });
  return invoices.map((invoice) => mapInvoice(invoice));
}

export async function getInvoiceById(id: string) {
  const ctx = await requirePermission("invoices.read");
  const invoice = await findInvoiceRecord(ctx.tenantId, id);
  return invoice ? mapInvoice(invoice) : null;
}

async function findInvoiceRecord(tenantId: string, id: string) {
  return prisma.invoice.findFirst({
    where: { id, organizationId: tenantId },
    select: INVOICE_SELECT,
  });
}

async function resolveSaleId(tenantId: string, value: unknown) {
  if (value === null) return null;
  const saleId = textValue(value);
  if (!saleId) return undefined;
  const sale = await prisma.sale.findFirst({ where: { id: saleId, organizationId: tenantId }, select: { id: true } });
  return sale?.id ?? null;
}

function buildInvoiceTotals(data: Record<string, unknown>) {
  const discountAmount = numberValue(data.discountAmount) ?? numberValue(data.discountTotal) ?? 0;
  const taxAmount = numberValue(data.taxAmount) ?? numberValue(data.taxTotal) ?? 0;
  const grandTotal = numberValue(data.grandTotal) ?? numberValue(data.totalAmount) ?? 0;

  return { discountAmount, taxAmount, grandTotal };
}

async function buildInvoiceCreateData(tenantId: string, data: Record<string, unknown>) {
  const invoiceNumber = textValue(data.invoiceNumber);
  const title = invoiceNumber ?? getTitle(data);
  const status = getStatus(data, "Unpaid");
  const { discountAmount, taxAmount, grandTotal } = buildInvoiceTotals(data);

  return {
    invoiceNumber,
    title,
    status,
    contactName: textValue(data.contactName),
    contactId: textValue(data.contactId),
    contactEmail: textValue(data.contactEmail) ?? textValue(data.recipientEmail),
    payload: invoicePayload(data),
    issueDate: dateValue(data.issueDate),
    dueDate: dateValue(data.dueDate),
    items: jsonArray(data.items),
    subtotal: numberValue(data.subtotal) ?? 0,
    discountAmount,
    discountRate: numberValue(data.discountRate),
    discountTotal: numberValue(data.discountTotal) ?? discountAmount,
    taxRate: numberValue(data.taxRate),
    taxAmount,
    taxTotal: numberValue(data.taxTotal) ?? taxAmount,
    totalAmount: numberValue(data.totalAmount) ?? grandTotal,
    currency: textValue(data.currency) ?? "USD",
    paymentStatus: textValue(data.paymentStatus) ?? status,
    paymentMethod: textValue(data.paymentMethod),
    saleId: await resolveSaleId(tenantId, data.saleId),
  };
}

async function syncFinanceTransaction(ctx: any, invoiceId: string, invoiceStatus: string, invoiceData: Record<string, unknown>, updatedTitle: string) {
  const existingTx = await prisma.transaction.findFirst({
    where: {
      organizationId: ctx.tenantId,
      sourceType: "Invoice",
      sourceId: invoiceId,
    },
  });

  if (invoiceStatus === "Paid") {
    if (!existingTx) {
      const amount = numberValue(invoiceData.totalAmount) ?? numberValue(invoiceData.grandTotal) ?? 0;
      const invoiceNumber = textValue(invoiceData.invoiceNumber) ?? updatedTitle;
      const txPayload = {
        title: `Payment received for Invoice ${invoiceNumber}`,
        transactionDate: new Date().toISOString().split("T")[0],
        type: "Income",
        category: "Invoice Payment",
        amount,
        currency: textValue(invoiceData.currency) ?? "USD",
        status: "Completed",
        reference: invoiceNumber,
        contactName: textValue(invoiceData.contactName),
        contactId: textValue(invoiceData.contactId),
        paymentMethod: "-",
        notes: "Auto-generated from Invoice payment.",
        sourceType: "Invoice",
        sourceId: invoiceId,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      await prisma.transaction.create({
        data: {
          organizationId: ctx.tenantId,
          title: txPayload.title,
          type: "Income",
          amount,
          currency: txPayload.currency,
          category: txPayload.category,
          transactionDate: new Date(),
          paymentMethod: txPayload.paymentMethod,
          reference: txPayload.reference,
          sourceType: "Invoice",
          sourceId: invoiceId,
          contactName: txPayload.contactName,
          contactId: txPayload.contactId,
          notes: txPayload.notes,
          status: "Completed",
          createdById: ctx.userId,
          updatedById: ctx.userId,
        }
      });
    } else {
      // Just in case it was cancelled before, restore to Completed
      await prisma.transaction.update({
        where: { id: existingTx.id },
        data: {
          status: "Completed",
          sourceType: existingTx.sourceType ?? "Invoice",
          sourceId: existingTx.sourceId ?? invoiceId,
          updatedById: ctx.userId
        }
      });
    }
  } else {
    // Status changed away from Paid (e.g. Unpaid or Cancelled) -> Cancel the transaction if it exists
    if (existingTx) {
      await prisma.transaction.update({
        where: { id: existingTx.id },
        data: {
          status: "Cancelled",
          updatedById: ctx.userId
        }
      });
    }
  }
}

export async function createInvoice(data: Record<string, unknown>) {
  const ctx = await requirePermission("invoices.create");
  const invoiceData = await buildInvoiceCreateData(ctx.tenantId, data);
  const invoiceStatus = invoiceData.status;
  const invoice = await prisma.invoice.create({
    data: {      organizationId: ctx.tenantId,
      ...invoiceData,
      createdById: ctx.userId,
      updatedById: ctx.userId,
    },
  });
  await logDomainActivity({ tenantId: ctx.tenantId, userId: ctx.userId, module: MODULE, action: "Created", entityType: ENTITY, entityId: invoice.id, entityName: invoice.invoiceNumber ?? invoice.title });

  if (invoiceStatus === "Paid") {
    await syncFinanceTransaction(ctx, invoice.id, invoiceStatus, mapInvoice(invoice), invoice.title ?? "Untitled");
  }

  return mapInvoice(invoice, ctx.user);
}

export async function updateInvoice(id: string, patch: Record<string, unknown>) {
  const ctx = await requirePermission("invoices.update");
  const current = await findInvoiceRecord(ctx.tenantId, id);
  if (!current) return null;
  const { discountAmount, taxAmount, grandTotal } = buildInvoiceTotals(patch);
  const saleId = patch.saleId !== undefined ? await resolveSaleId(ctx.tenantId, patch.saleId) : current.saleId;
  const updated = await prisma.invoice.update({
    where: { id: current.id },
    data: {
      invoiceNumber: patch.invoiceNumber !== undefined ? textValue(patch.invoiceNumber) : current.invoiceNumber,
      title: patch.invoiceNumber !== undefined || patch.title !== undefined ? textValue(patch.invoiceNumber) ?? getTitle(patch, current.title ?? "Untitled") : current.title,
      status: typeof patch.status === "string" ? patch.status : current.status,
      contactName: patch.contactName !== undefined ? textValue(patch.contactName) : current.contactName,
      contactId: patch.contactId !== undefined ? textValue(patch.contactId) : current.contactId,
      contactEmail: patch.contactEmail !== undefined || patch.recipientEmail !== undefined ? textValue(patch.contactEmail) ?? textValue(patch.recipientEmail) : current.contactEmail,
      payload: invoicePayload(patch, current.payload),
      issueDate: patch.issueDate !== undefined ? dateValue(patch.issueDate) : current.issueDate,
      dueDate: patch.dueDate !== undefined ? dateValue(patch.dueDate) : current.dueDate,
      items: patch.items !== undefined ? jsonArray(patch.items) : jsonInputOrDefault(current.items, []),
      subtotal: patch.subtotal !== undefined ? numberValue(patch.subtotal) ?? current.subtotal : current.subtotal,
      discountAmount: patch.discountAmount !== undefined || patch.discountTotal !== undefined ? discountAmount : current.discountAmount,
      discountRate: patch.discountRate !== undefined ? numberValue(patch.discountRate) : current.discountRate,
      discountTotal: patch.discountTotal !== undefined || patch.discountAmount !== undefined ? numberValue(patch.discountTotal) ?? numberValue(patch.discountAmount) ?? current.discountTotal : current.discountTotal,
      taxRate: patch.taxRate !== undefined ? numberValue(patch.taxRate) : current.taxRate,
      taxAmount: patch.taxAmount !== undefined || patch.taxTotal !== undefined ? taxAmount : current.taxAmount,
      taxTotal: patch.taxTotal !== undefined || patch.taxAmount !== undefined ? numberValue(patch.taxTotal) ?? numberValue(patch.taxAmount) ?? current.taxTotal : current.taxTotal,
      totalAmount: patch.totalAmount !== undefined || patch.grandTotal !== undefined ? numberValue(patch.totalAmount) ?? grandTotal : current.totalAmount,
      currency: patch.currency !== undefined ? textValue(patch.currency) ?? current.currency : current.currency,
      paymentStatus: patch.paymentStatus !== undefined || patch.status !== undefined ? textValue(patch.paymentStatus) ?? textValue(patch.status) : current.paymentStatus,
      paymentMethod: patch.paymentMethod !== undefined ? textValue(patch.paymentMethod) : current.paymentMethod,
      saleId,
      updatedById: ctx.userId,
    },
    select: INVOICE_SELECT,
  });
  await logDomainActivity({ tenantId: ctx.tenantId, userId: ctx.userId, module: MODULE, action: "Updated", entityType: ENTITY, entityId: current.id, entityName: updated.invoiceNumber ?? updated.title });

  // Post-update hook: Manage Finance Cashflow for Invoices
  if (typeof patch.status === "string" && patch.status !== current.status) {
    await syncFinanceTransaction(ctx, current.id, patch.status, mapInvoice(updated), updated.title ?? "Untitled");
  }

  return mapInvoice(updated);
}

export async function deleteInvoice(id: string) {
  const ctx = await requirePermission("invoices.delete");
  const current = await findInvoiceRecord(ctx.tenantId, id);
  if (!current) return null;
  const result = await prisma.invoice.deleteMany({ where: { id: current.id, organizationId: ctx.tenantId } });
  if (result.count === 0) return null;
  await logDomainActivity({ tenantId: ctx.tenantId, userId: ctx.userId, module: MODULE, action: "Deleted", entityType: ENTITY, entityId: current.id, entityName: current.title });
  return { id: current.id };
}
