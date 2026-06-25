import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/server/rbac";
import { getStatus, getTitle, logDomainActivity, mapDomainRecord, parsePayload } from "@/lib/api/domain-utils";
import { intValue, jsonArray, jsonInputOrDefault, jsonObjectOrUndefined, numberValue, textValue } from "@/lib/api/feature-records";

const MODULE = "SALES";
const ENTITY = "Product";

const PRODUCT_SELECT = {
  id: true,
  organizationId: true,
  title: true,
  name: true,
  sku: true,
  category: true,
  type: true,
  price: true,
  currency: true,
  stock: true,
  totalQuantity: true,
  minThreshold: true,
  status: true,
  activities: true,
  comments: true,
  payload: true,
  createdById: true,
  updatedById: true,
  createdAt: true,
  updatedAt: true,
  createdBy: { select: { id: true, name: true, email: true, image: true } },
} as const;

function productPayload(data: Record<string, unknown>, currentPayload?: unknown) {
  const payload = { ...parsePayload(currentPayload), ...parsePayload(data.payload) };
  delete payload.comments;
  return jsonObjectOrUndefined(payload) ?? {};
}

function mapProduct(record: any, fallbackUser?: { id: string; name: string; email?: string | null; image?: string | null }) {
  const mapped = mapDomainRecord(record, fallbackUser) as any;
  return {
    ...mapped,
    sku: mapped.sku ?? "SKU-TBD",
    activities: Array.isArray(mapped.activities) ? mapped.activities : [],
    comments: Array.isArray(mapped.comments) ? mapped.comments : [],
  };
}

function buildProductCreateData(data: Record<string, unknown>) {
  const name = textValue(data.name) ?? getTitle(data);
  const sku = textValue(data.sku);
  const stock = intValue(data.stock) ?? intValue(data.totalQuantity) ?? 0;

  return {
    title: name,
    name,
    sku,
    category: textValue(data.category) ?? "Uncategorized",
    type: textValue(data.type) ?? "Physical",
    price: numberValue(data.price) ?? 0,
    currency: textValue(data.currency) ?? "USD",
    stock,
    totalQuantity: intValue(data.totalQuantity) ?? stock,
    minThreshold: intValue(data.minThreshold) ?? 10,
    status: getStatus(data, "Active"),
    activities: jsonArray(data.activities),
    comments: jsonArray(data.comments),
    payload: productPayload(data),
  };
}

export async function listProducts() {
  const ctx = await requirePermission("products.read");
  const products = await prisma.product.findMany({ where: { organizationId: ctx.tenantId }, orderBy: { createdAt: "desc" }, select: PRODUCT_SELECT });
  return products.map((product: any) => mapProduct(product));
}

export async function getProductById(id: string) {
  const ctx = await requirePermission("products.read");
  const product = await prisma.product.findFirst({ where: { id, organizationId: ctx.tenantId }, select: PRODUCT_SELECT });
  return product ? mapProduct(product) : null;
}

export async function createProduct(data: Record<string, unknown>) {
  const ctx = await requirePermission("products.create");
  const productData = buildProductCreateData(data);
  const product = await prisma.product.create({
    data: {      organizationId: ctx.tenantId,
      ...productData,
      createdById: ctx.userId,
      updatedById: ctx.userId,
    },
    select: PRODUCT_SELECT,
  });
  await logDomainActivity({ tenantId: ctx.tenantId, userId: ctx.userId, module: MODULE, action: "Created", entityType: ENTITY, entityId: product.id, entityName: product.name ?? product.title });
  return mapProduct(product, ctx.user);
}

export async function updateProduct(id: string, patch: Record<string, unknown>) {
  const ctx = await requirePermission("products.update");
  const current = await prisma.product.findFirst({ where: { id, organizationId: ctx.tenantId }, select: PRODUCT_SELECT });
  if (!current) return null;
  const name = textValue(patch.name) ?? textValue(patch.title) ?? current.name ?? current.title ?? "Untitled";
  const stock = intValue(patch.stock) ?? intValue(patch.totalQuantity) ?? current.stock;
  const updated = await prisma.product.update({
    where: { id },
    data: {
      title: name,
      name,
      sku: patch.sku !== undefined ? textValue(patch.sku) : current.sku,
      category: patch.category !== undefined ? textValue(patch.category) : current.category,
      type: patch.type !== undefined ? textValue(patch.type) ?? current.type : current.type,
      price: patch.price !== undefined ? numberValue(patch.price) ?? current.price : current.price,
      currency: patch.currency !== undefined ? textValue(patch.currency) ?? current.currency : current.currency,
      stock,
      totalQuantity: intValue(patch.totalQuantity) ?? intValue(patch.stock) ?? current.totalQuantity,
      minThreshold: patch.minThreshold !== undefined ? intValue(patch.minThreshold) ?? current.minThreshold : current.minThreshold,
      status: typeof patch.status === "string" ? patch.status : current.status,
      activities: patch.activities !== undefined ? jsonArray(patch.activities) : jsonInputOrDefault(current.activities, []),
      comments: patch.comments !== undefined ? jsonArray(patch.comments) : jsonInputOrDefault(current.comments, []),
      payload: productPayload(patch, current.payload),
      updatedById: ctx.userId,
    },
    select: PRODUCT_SELECT,
  });
  await logDomainActivity({ tenantId: ctx.tenantId, userId: ctx.userId, module: MODULE, action: "Updated", entityType: ENTITY, entityId: id, entityName: updated.name ?? updated.title });
  return mapProduct(updated);
}

export async function deleteProduct(id: string) {
  const ctx = await requirePermission("products.delete");
  const current = await prisma.product.findFirst({ where: { id, organizationId: ctx.tenantId }, select: { title: true } });
  if (!current) return null;
  const result = await prisma.product.deleteMany({ where: { id, organizationId: ctx.tenantId } });
  if (result.count === 0) return null;
  await logDomainActivity({ tenantId: ctx.tenantId, userId: ctx.userId, module: MODULE, action: "Deleted", entityType: ENTITY, entityId: id, entityName: current.title });
  return { id };
}
