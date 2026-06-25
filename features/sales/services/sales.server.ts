import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/server/rbac";
import { getStatus, getTitle, logDomainActivity, mapDomainRecord } from "@/lib/api/domain-utils";
import { jsonArray, jsonInputOrDefault, numberValue, textValue } from "@/lib/api/feature-records";

const MODULE = "SALES";
const ENTITY = "Sale";

function buildSaleCreateData(data: Record<string, unknown>) {
  const title = getTitle(data);
  const saleNumber = textValue(data.saleNumber) ?? textValue(data.orderNumber);
  const discountAmount = numberValue(data.discountAmount) ?? numberValue(data.discountTotal) ?? 0;
  const grandTotal = numberValue(data.grandTotal) ?? numberValue(data.total) ?? 0;

  return {
    saleNumber,
    title,
    status: getStatus(data),
    saleType: textValue(data.saleType),
    paymentStatus: textValue(data.paymentStatus),
    contactName: textValue(data.contactName),
    contactId: textValue(data.contactId),
    items: jsonArray(data.items),
    subtotal: numberValue(data.subtotal) ?? 0,
    discountAmount,
    taxAmount: numberValue(data.taxAmount) ?? 0,
    grandTotal,
    currency: textValue(data.currency) ?? "USD",
    orderDiscountValue: numberValue(data.orderDiscountValue),
    orderDiscountType: textValue(data.orderDiscountType),
    discountTotal: numberValue(data.discountTotal) ?? discountAmount,
    taxPercentage: numberValue(data.taxPercentage),
    activities: jsonArray(data.activities),
    shippingAddress: textValue(data.shippingAddress),
  };
}

export async function listSales() {
  const ctx = await requirePermission("sales.read");
  const sales = await prisma.sale.findMany({ where: { organizationId: ctx.tenantId }, orderBy: { createdAt: "desc" }, include: { createdBy: { select: { id: true, name: true, email: true, image: true } } } });
  return sales.map((sale) => mapDomainRecord(sale));
}

export async function getSaleById(id: string) {
  const ctx = await requirePermission("sales.read");
  const sale = await prisma.sale.findFirst({ where: { id, organizationId: ctx.tenantId }, include: { createdBy: { select: { id: true, name: true, email: true, image: true } } } });
  return sale ? mapDomainRecord(sale) : null;
}

export async function createSale(data: Record<string, unknown>) {
  const ctx = await requirePermission("sales.create");
  const saleData = buildSaleCreateData(data);
  const sale = await prisma.sale.create({
    data: {      organizationId: ctx.tenantId,
      ...saleData,
      createdById: ctx.userId,
      updatedById: ctx.userId,
    },
  });
  await logDomainActivity({ tenantId: ctx.tenantId, userId: ctx.userId, module: MODULE, action: "Created", entityType: ENTITY, entityId: sale.id, entityName: sale.title });
  return mapDomainRecord(sale, ctx.user);
}

export async function updateSale(id: string, patch: Record<string, unknown>) {
  const ctx = await requirePermission("sales.update");
  const current = await prisma.sale.findFirst({ where: { id, organizationId: ctx.tenantId } });
  if (!current) return null;
  const discountAmount = patch.discountAmount !== undefined || patch.discountTotal !== undefined
    ? numberValue(patch.discountAmount) ?? numberValue(patch.discountTotal) ?? current.discountAmount
    : current.discountAmount;
  const grandTotal = patch.grandTotal !== undefined || patch.total !== undefined
    ? numberValue(patch.grandTotal) ?? numberValue(patch.total) ?? current.grandTotal
    : current.grandTotal;
  const updated = await prisma.sale.update({
    where: { id },
    data: {
      saleNumber: patch.saleNumber !== undefined || patch.orderNumber !== undefined ? textValue(patch.saleNumber) ?? textValue(patch.orderNumber) : current.saleNumber,
      title: getTitle(patch, current.title ?? "Untitled"),
      status: typeof patch.status === "string" ? patch.status : current.status,
      saleType: patch.saleType !== undefined ? textValue(patch.saleType) : current.saleType,
      paymentStatus: patch.paymentStatus !== undefined ? textValue(patch.paymentStatus) : current.paymentStatus,
      contactName: patch.contactName !== undefined ? textValue(patch.contactName) : current.contactName,
      contactId: patch.contactId !== undefined ? textValue(patch.contactId) : current.contactId,
      items: patch.items !== undefined ? jsonArray(patch.items) : jsonInputOrDefault(current.items, []),
      subtotal: patch.subtotal !== undefined ? numberValue(patch.subtotal) ?? current.subtotal : current.subtotal,
      discountAmount,
      taxAmount: patch.taxAmount !== undefined ? numberValue(patch.taxAmount) ?? current.taxAmount : current.taxAmount,
      grandTotal,
      currency: patch.currency !== undefined ? textValue(patch.currency) ?? current.currency : current.currency,
      orderDiscountValue: patch.orderDiscountValue !== undefined ? numberValue(patch.orderDiscountValue) : current.orderDiscountValue,
      orderDiscountType: patch.orderDiscountType !== undefined ? textValue(patch.orderDiscountType) : current.orderDiscountType,
      discountTotal: patch.discountTotal !== undefined || patch.discountAmount !== undefined ? numberValue(patch.discountTotal) ?? numberValue(patch.discountAmount) ?? current.discountTotal : current.discountTotal,
      taxPercentage: patch.taxPercentage !== undefined ? numberValue(patch.taxPercentage) : current.taxPercentage,
      activities: patch.activities !== undefined ? jsonArray(patch.activities) : jsonInputOrDefault(current.activities, []),
      shippingAddress: patch.shippingAddress !== undefined ? textValue(patch.shippingAddress) : current.shippingAddress,
      updatedById: ctx.userId,
    },
    include: { createdBy: { select: { id: true, name: true, email: true, image: true } } },
  });
  await logDomainActivity({ tenantId: ctx.tenantId, userId: ctx.userId, module: MODULE, action: "Updated", entityType: ENTITY, entityId: id, entityName: updated.title });
  return mapDomainRecord(updated);
}

export async function deleteSale(id: string) {
  const ctx = await requirePermission("sales.delete");
  const current = await prisma.sale.findFirst({ where: { id, organizationId: ctx.tenantId } });
  if (!current) return null;
  const result = await prisma.sale.deleteMany({ where: { id, organizationId: ctx.tenantId } });
  if (result.count === 0) return null;
  await logDomainActivity({ tenantId: ctx.tenantId, userId: ctx.userId, module: MODULE, action: "Deleted", entityType: ENTITY, entityId: id, entityName: current.title });
  return { id };
}
