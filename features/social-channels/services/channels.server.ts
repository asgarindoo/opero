import { prisma } from "@/lib/prisma";
import { parsePayload } from "@/lib/api/domain-utils";
import { requirePermission } from "@/lib/server/rbac";
import { normalizeUserAvatarImage } from "@/lib/server/supabase-storage";
import { getUserDisplayName } from "@/lib/user-identity";
import { jsonObjectOrUndefined, numberValue, textValue } from "@/lib/api/feature-records";

const DB_INT_MAX = 2147483647;
const STAT_KEYS = ["followers", "postsThisMonth", "interactions", "monthlyReach", "averageViews"] as const;

const CHANNEL_SELECT = {
  id: true,
  organizationId: true,
  title: true,
  accountName: true,
  platform: true,
  handle: true,
  profileUrl: true,
  status: true,
  followers: true,
  postsThisMonth: true,
  interactions: true,
  monthlyReach: true,
  averageViews: true,
  notes: true,
  payload: true,
  createdAt: true,
  updatedAt: true,
} as const;

function withoutUndefined<T extends Record<string, unknown>>(data: T) {
  return Object.fromEntries(Object.entries(data).filter(([, value]) => value !== undefined)) as Partial<T>;
}

function statNumber(value: unknown) {
  const parsed = numberValue(value);
  if (parsed === undefined) return undefined;
  return Math.max(0, Math.trunc(parsed));
}

function dbIntStat(value: unknown, fallback?: number | null) {
  const parsed = statNumber(value);
  if (parsed === undefined) return fallback ?? undefined;
  return Math.min(parsed, DB_INT_MAX);
}

function statPayload(data: Record<string, unknown>, currentPayload?: unknown) {
  const payload = { ...parsePayload(currentPayload) };
  for (const key of STAT_KEYS) {
    const value = statNumber(data[key]);
    if (value !== undefined) payload[key] = value;
  }
  return jsonObjectOrUndefined(payload);
}

function mappedStat(record: Record<string, unknown>, payload: Record<string, unknown>, key: (typeof STAT_KEYS)[number], fallback = 0) {
  return statNumber(payload[key]) ?? statNumber(record[key]) ?? fallback;
}

function mapChannel(c: any) {
  const accountName = c.accountName || c.title || "";
  const handle = c.handle || "";
  const profileUrl = c.profileUrl || "";
  const payload = parsePayload(c.payload);

  return {
    name: accountName,
    accountName,
    title: c.title || accountName,
    platform: c.platform || "",
    username: handle,
    handle,
    profileLink: profileUrl,
    profileUrl,
    status: c.status || "Active",
    followers: mappedStat(c, payload, "followers"),
    postsThisMonth: mappedStat(c, payload, "postsThisMonth"),
    interactions: mappedStat(c, payload, "interactions"),
    monthlyReach: mappedStat(c, payload, "monthlyReach", c.monthlyReach),
    averageViews: mappedStat(c, payload, "averageViews", c.averageViews),
    notes: c.notes ?? "",
    id: c.id,
    createdAt: c.createdAt.toISOString(),
    updatedAt: c.updatedAt.toISOString()
  };
}

function buildChannelCreateData(data: Record<string, unknown>) {
  const accountName = textValue(data.accountName) ?? textValue(data.name) ?? textValue(data.title) ?? "New Channel";
  const handle = textValue(data.handle) ?? textValue(data.username);
  const profileUrl = textValue(data.profileUrl) ?? textValue(data.profileLink);

  return {
    title: accountName,
    accountName,
    platform: textValue(data.platform),
    handle,
    profileUrl,
    status: textValue(data.status) ?? "Active",
    followers: dbIntStat(data.followers, 0),
    postsThisMonth: dbIntStat(data.postsThisMonth, 0),
    interactions: dbIntStat(data.interactions, 0),
    monthlyReach: dbIntStat(data.monthlyReach),
    averageViews: dbIntStat(data.averageViews),
    notes: textValue(data.notes),
    payload: statPayload(data),
  };
}

export async function listChannels() {
  const context = await requirePermission("socialChannels.read");

  const channels = await prisma.socialChannel.findMany({
    where: { organizationId: context.tenant.id },
    orderBy: { createdAt: 'desc' },
    select: CHANNEL_SELECT,
  });

  return channels.map(mapChannel);
}

export async function createChannel(data: Record<string, unknown>) {
  const context = await requirePermission("socialChannels.create");

  const channelData = buildChannelCreateData(data);

  const ch = await prisma.socialChannel.create({
    data: {
      organizationId: context.tenant.id,
      createdById: context.user.id,
      ...withoutUndefined(channelData),
    },
    select: CHANNEL_SELECT,
  });

  await prisma.tenantActivity.create({
    data: {
      organizationId: context.tenant.id,
      module: "MARKETING",
      action: "Added Channel",
      entityId: ch.id,
      entityType: "SocialChannel",
      entityName: ch.title,
      userId: context.user.id
    }
  });

  return mapChannel(ch);
}

export async function updateChannel(id: string, patch: Record<string, unknown>) {
  const context = await requirePermission("socialChannels.update");

  const existing = await prisma.socialChannel.findUnique({ where: { id }, select: CHANNEL_SELECT });
  if (!existing || existing.organizationId !== context.tenant.id) {
    throw new Error("Not found or unauthorized");
  }

  const accountName = textValue(patch.accountName) ?? textValue(patch.name) ?? textValue(patch.title) ?? existing.accountName ?? existing.title ?? "New Channel";
  const handle = patch.handle !== undefined || patch.username !== undefined ? textValue(patch.handle) ?? textValue(patch.username) : existing.handle;
  const profileUrl = patch.profileUrl !== undefined || patch.profileLink !== undefined ? textValue(patch.profileUrl) ?? textValue(patch.profileLink) : existing.profileUrl;

  const ch = await prisma.socialChannel.update({
    where: { id },
    data: {
      ...withoutUndefined({
        title: accountName,
        accountName,
        platform: patch.platform !== undefined ? textValue(patch.platform) : existing.platform,
        handle,
        profileUrl,
        status: patch.status !== undefined ? textValue(patch.status) ?? existing.status : existing.status,
        followers: patch.followers !== undefined ? dbIntStat(patch.followers, existing.followers) : existing.followers,
        postsThisMonth: patch.postsThisMonth !== undefined ? dbIntStat(patch.postsThisMonth, existing.postsThisMonth) : existing.postsThisMonth,
        interactions: patch.interactions !== undefined ? dbIntStat(patch.interactions, existing.interactions) : existing.interactions,
        monthlyReach: patch.monthlyReach !== undefined ? dbIntStat(patch.monthlyReach) : existing.monthlyReach,
        averageViews: patch.averageViews !== undefined ? dbIntStat(patch.averageViews) : existing.averageViews,
        notes: patch.notes !== undefined ? textValue(patch.notes) : existing.notes,
        payload: statPayload(patch, existing.payload),
      }),
      updatedById: context.user.id,
    },
    select: CHANNEL_SELECT,
  });

  await prisma.tenantActivity.create({
    data: {
      organizationId: context.tenant.id,
      module: "MARKETING",
      action: "Updated Channel",
      entityId: ch.id,
      entityType: "SocialChannel",
      entityName: ch.title,
      userId: context.user.id
    }
  });

  return mapChannel(ch);
}

export async function deleteChannel(id: string) {
  const context = await requirePermission("socialChannels.delete");

  const existing = await prisma.socialChannel.findUnique({ where: { id }, select: { organizationId: true, title: true } });
  if (!existing || existing.organizationId !== context.tenant.id) {
    return { success: true };
  }

  await prisma.socialChannel.delete({ where: { id } });

  await prisma.tenantActivity.create({
    data: {
      organizationId: context.tenant.id,
      module: "MARKETING",
      action: "Deleted Channel",
      entityId: id,
      entityType: "SocialChannel",
      entityName: existing.title,
      userId: context.user.id
    }
  });

  return { success: true };
}

export async function listChannelActivities() {
  const context = await requirePermission("socialChannels.read");

  const acts = await prisma.tenantActivity.findMany({
    where: { 
      organizationId: context.tenant.id,
      module: "MARKETING",
      entityType: "SocialChannel",
    },
    orderBy: { createdAt: 'desc' },
    take: 5,
    select: {
      id: true,
      action: true,
      entityName: true,
      createdAt: true,
      user: { select: { id: true, name: true, email: true, image: true } },
    }
  });

  return acts.map((act: any) => ({
    id: act.id,
    action: act.action,
    channel: act.entityName || "Unknown",
    user: getUserDisplayName(act.user, "System"),
    userEmail: act.user?.email ?? undefined,
    userImage: act.user?.id ? normalizeUserAvatarImage(act.user.id, act.user.image) : undefined,
    time: act.createdAt.toISOString()
  }));
}
