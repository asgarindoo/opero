import { createClient } from "@supabase/supabase-js";

export const TENANT_ASSETS_BUCKET = "tenant-assets";
export const TENANT_FILES_BUCKET = "tenant-files";
export const TENANT_LOGO_FOLDER = "AvatarTenant";
export const USER_AVATAR_FOLDER = "AvatarUser";

const DATA_URL_PATTERN = /^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/;
const USER_AVATAR_MAX_BYTES = 2 * 1024 * 1024;
const USER_AVATAR_EXTENSIONS = ["png", "jpg", "jpeg", "webp"] as const;
const USER_AVATAR_ALLOWED_TYPES = new Map<string, typeof USER_AVATAR_EXTENSIONS[number]>([
  ["image/png", "png"],
  ["image/jpeg", "jpg"],
  ["image/webp", "webp"],
]);

function getSupabaseAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY;

  if (!url || !key) {
    throw new Error("Supabase storage is not configured.");
  }

  return createClient(url, key, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}

type SupabaseAdminClient = ReturnType<typeof getSupabaseAdmin>;

function isStorageNotFoundError(error: unknown) {
  const storageError = error as { message?: string; status?: number; statusCode?: string | number };
  return (
    storageError.status === 404 ||
    storageError.statusCode === 404 ||
    storageError.statusCode === "404" ||
    /bucket not found|not found/i.test(storageError.message ?? "")
  );
}

async function listStorageObjectPaths(
  supabase: SupabaseAdminClient,
  bucket: string,
  prefix: string
): Promise<string[]> {
  const bucketClient = supabase.storage.from(bucket);
  const paths: string[] = [];
  const pageSize = 1000;

  async function walk(folder: string) {
    for (let offset = 0; ; offset += pageSize) {
      const { data, error } = await bucketClient.list(folder, {
        limit: pageSize,
        offset,
      });

      if (error) {
        if (isStorageNotFoundError(error)) return;
        throw error;
      }

      const entries = data ?? [];
      for (const entry of entries) {
        const objectPath = `${folder}/${entry.name}`;
        if (!entry.id) {
          await walk(objectPath);
        } else {
          paths.push(objectPath);
        }
      }

      if (entries.length < pageSize) break;
    }
  }

  await walk(prefix.replace(/\/+$/, ""));
  return paths;
}

async function removeStoragePrefix(supabase: SupabaseAdminClient, bucket: string, prefix: string) {
  const bucketClient = supabase.storage.from(bucket);
  const paths = await listStorageObjectPaths(supabase, bucket, prefix);
  const chunkSize = 100;

  for (let i = 0; i < paths.length; i += chunkSize) {
    const { error } = await bucketClient.remove(paths.slice(i, i + chunkSize));
    if (error) {
      if (isStorageNotFoundError(error)) return;
      throw error;
    }
  }
}

export async function deleteTenantStorageObjects(organizationId: string) {
  const supabase = getSupabaseAdmin();

  await Promise.all([
    removeStoragePrefix(supabase, TENANT_ASSETS_BUCKET, `${TENANT_LOGO_FOLDER}/${organizationId}`),
    removeStoragePrefix(supabase, TENANT_FILES_BUCKET, `tenants/${organizationId}`),
  ]);
}

function extensionFromMime(mimeType: string) {
  switch (mimeType) {
    case "image/jpeg":
      return "jpg";
    case "image/png":
      return "png";
    case "image/webp":
      return "webp";
    case "image/gif":
      return "gif";
    case "image/svg+xml":
      return "svg";
    default:
      return "bin";
  }
}

function extensionFromAvatarFile(file: File) {
  const extension = file.name.includes(".")
    ? file.name.split(".").pop()?.toLowerCase()
    : undefined;
  const mimeExtension = USER_AVATAR_ALLOWED_TYPES.get(file.type);

  if (!mimeExtension) {
    throw new Error("Profile photo must be a PNG, JPG, JPEG, or WEBP image.");
  }

  if (extension && !USER_AVATAR_EXTENSIONS.includes(extension as typeof USER_AVATAR_EXTENSIONS[number])) {
    throw new Error("Profile photo must be a PNG, JPG, JPEG, or WEBP image.");
  }

  if (file.type === "image/jpeg" && extension === "jpeg") return "jpeg";
  return mimeExtension;
}

export function isDataImage(value: string | null | undefined) {
  return !!value && DATA_URL_PATTERN.test(value);
}

export function isExternalImageUrl(value: string | null | undefined) {
  return !!value && /^https?:\/\//i.test(value);
}

export function userAvatarObjectPath(userId: string, extension: string) {
  return `${USER_AVATAR_FOLDER}/${userId}/avatar.${extension}`;
}

export function userAvatarRouteUrl(userId: string, objectPath: string, cacheToken = Date.now().toString()) {
  const params = new URLSearchParams({ v: objectPath });

  if (cacheToken) {
    params.set("t", cacheToken);
  }

  return `/api/profile/avatar/${userId}?${params.toString()}`;
}

function legacyUserAvatarObjectPath(userId: string, extension: string) {
  return `${USER_AVATAR_FOLDER}/${userId}.${extension}`;
}

export function storageObjectPathFromUrl(bucket: string, value: string | null | undefined) {
  if (!value) return null;

  const directValue = value.split("?")[0];
  if (directValue.startsWith(`${USER_AVATAR_FOLDER}/`) || directValue.startsWith(`${TENANT_LOGO_FOLDER}/`)) {
    return directValue;
  }

  if (value.startsWith("/api/profile/avatar/") || value.startsWith("/api/tenant/logo/")) {
    return new URL(value, "http://opero.local").searchParams.get("v");
  }

  try {
    const url = new URL(value);
    const publicMarker = `/storage/v1/object/public/${bucket}/`;
    const markerIndex = url.pathname.indexOf(publicMarker);
    if (markerIndex < 0) return null;
    return decodeURIComponent(url.pathname.slice(markerIndex + publicMarker.length));
  } catch {
    return null;
  }
}

export function storedUserAvatarPath(userId: string, image: string | null | undefined) {
  const path = storageObjectPathFromUrl(TENANT_ASSETS_BUCKET, image);
  if (!path) return null;

  const legacyPathPattern = new RegExp(`^${USER_AVATAR_FOLDER}/${userId}\\.(?:${USER_AVATAR_EXTENSIONS.join("|")})$`);
  if (legacyPathPattern.test(path) || path.startsWith(`${USER_AVATAR_FOLDER}/${userId}/`)) {
    return path;
  }

  return null;
}

export function normalizeUserAvatarImage(userId: string, image: string | null | undefined) {
  if (!image || image.startsWith("/api/profile/avatar/") || image.startsWith("data:image/")) {
    return image ?? null;
  }

  const avatarPath = storedUserAvatarPath(userId, image);
  return avatarPath ? userAvatarRouteUrl(userId, avatarPath) : image;
}

async function uploadImageFromDataUrl(params: {
  dataUrl: string;
  label: string;
  objectPath: string;
}) {
  const match = params.dataUrl.match(DATA_URL_PATTERN);
  if (!match) {
    throw new Error(`${params.label} must be a valid image data URL.`);
  }

  const [, contentType, base64] = match;
  const buffer = Buffer.from(base64, "base64");
  const maxBytes = 2 * 1024 * 1024;

  if (buffer.byteLength > maxBytes) {
    throw new Error(`${params.label} must be smaller than 2MB.`);
  }

  const supabase = getSupabaseAdmin();

  const { error } = await supabase.storage
    .from(TENANT_ASSETS_BUCKET)
    .upload(params.objectPath, buffer, {
      contentType,
      upsert: true,
    });

  if (error) {
    throw error;
  }

  return params.objectPath;
}

export async function uploadTenantLogoFromDataUrl(params: {
  organizationId: string;
  dataUrl: string;
}) {
  const match = params.dataUrl.match(DATA_URL_PATTERN);
  const ext = extensionFromMime(match?.[1] ?? "");
  const objectPath = `${TENANT_LOGO_FOLDER}/${params.organizationId}/logo-${Date.now()}.${ext}`;

  return uploadImageFromDataUrl({
    dataUrl: params.dataUrl,
    label: "Logo",
    objectPath,
  });
}

export async function uploadUserAvatarFromDataUrl(params: {
  userId: string;
  dataUrl: string;
}) {
  const match = params.dataUrl.match(DATA_URL_PATTERN);
  const ext = extensionFromMime(match?.[1] ?? "");
  const objectPath = userAvatarObjectPath(params.userId, ext);

  return uploadImageFromDataUrl({
    dataUrl: params.dataUrl,
    label: "Avatar",
    objectPath,
  });
}

export async function uploadUserAvatarFile(params: {
  userId: string;
  file: File;
}) {
  if (params.file.size > USER_AVATAR_MAX_BYTES) {
    throw new Error("Profile photo must be smaller than 2MB.");
  }

  const ext = extensionFromAvatarFile(params.file);
  const objectPath = userAvatarObjectPath(params.userId, ext);
  const buffer = Buffer.from(await params.file.arrayBuffer());
  const supabase = getSupabaseAdmin();

  const { error } = await supabase.storage
    .from(TENANT_ASSETS_BUCKET)
    .upload(objectPath, buffer, {
      contentType: params.file.type,
      upsert: true,
    });

  if (error) {
    throw error;
  }

  return {
    objectPath,
  };
}

export async function removeUserAvatarFiles(params: {
  userId: string;
  excludePath?: string | null;
  extraPaths?: Array<string | null | undefined>;
}) {
  const supabase = getSupabaseAdmin();
  const legacyFolder = `${USER_AVATAR_FOLDER}/${params.userId}`;
  const { data: legacyFiles, error: listError } = await supabase.storage
    .from(TENANT_ASSETS_BUCKET)
    .list(legacyFolder, { limit: 100 });

  if (listError) {
    throw listError;
  }

  const avatarPaths = USER_AVATAR_EXTENSIONS.map((extension) => userAvatarObjectPath(params.userId, extension));
  const legacyRootPaths = USER_AVATAR_EXTENSIONS.map((extension) => legacyUserAvatarObjectPath(params.userId, extension));
  const legacyPaths = (legacyFiles ?? []).map((file) => `${legacyFolder}/${file.name}`);
  const extraPaths = (params.extraPaths ?? []).filter(Boolean) as string[];
  const paths = Array.from(new Set([...avatarPaths, ...legacyRootPaths, ...legacyPaths, ...extraPaths]))
    .filter((path) => path && path !== params.excludePath);

  if (paths.length === 0) return;

  const { error } = await supabase.storage.from(TENANT_ASSETS_BUCKET).remove(paths);

  if (error) {
    throw error;
  }
}

export async function removePrivateObject(bucket: string, path: string | null | undefined) {
  if (!path || path.startsWith("data:image/") || /^https?:\/\//i.test(path)) return;

  const supabase = getSupabaseAdmin();
  const { error } = await supabase.storage.from(bucket).remove([path]);

  if (error) {
    throw error;
  }
}

function safeFileName(name: string) {
  const cleaned = name
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\x00-\x7F]+/g, "-")
    .replace(/[^\w.-]+/g, "-")
    .replace(/[/\\?%*:|"<>]/g, "-")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^[.-]+|[.-]+$/g, "")
    .slice(0, 120);

  return cleaned || "file";
}

export async function uploadTenantPrivateFile(params: {
  organizationId: string;
  file: File;
  folder?: string;
}) {
  const maxBytes = 30 * 1024 * 1024;

  if (params.file.size > maxBytes) {
    throw new Error("File must be smaller than 30MB.");
  }

  const supabase = getSupabaseAdmin();
  const folder = params.folder ? safeFileName(params.folder) : "files";
  const objectPath = `tenants/${params.organizationId}/${folder}/${Date.now()}-${safeFileName(params.file.name)}`;
  const buffer = Buffer.from(await params.file.arrayBuffer());

  const { error } = await supabase.storage
    .from(TENANT_FILES_BUCKET)
    .upload(objectPath, buffer, {
      contentType: params.file.type || "application/octet-stream",
      upsert: false,
    });

  if (error) {
    throw error;
  }

  return objectPath;
}

const ALLOWED_DOCUMENT_EXTENSIONS = new Set([
  "pdf", "docx", "xlsx", "pptx", "txt", "csv", // Documents
  "png", "jpg", "jpeg", "webp", "svg",         // Images
  "zip", "rar"                                 // Archives
]);

const BLOCKED_EXTENSIONS = new Set([
  "exe", "apk", "dmg", "bat", "sh", "js", "msi", "app", "cmd", "com"
]);

export async function uploadTenantDocument(params: {
  organizationId: string;
  file: File;
  folder?: string;
}) {
  const maxBytes = 30 * 1024 * 1024;

  if (params.file.size > maxBytes) {
    throw new Error("Maximum upload size is 30MB.");
  }

  // Validate extension
  const fileNameParts = params.file.name.split(".");
  const ext = fileNameParts.length > 1 ? fileNameParts.pop()?.toLowerCase() || "" : "";

  if (!ext || BLOCKED_EXTENSIONS.has(ext) || !ALLOWED_DOCUMENT_EXTENSIONS.has(ext)) {
    throw new Error("Unsupported file type.");
  }

  const supabase = getSupabaseAdmin();
  const folder = params.folder ? safeFileName(params.folder) : "uncategorized";

  const cleanBaseName = safeFileName(fileNameParts.join("."));
  const objectPath = `tenants/${params.organizationId}/${folder}/${cleanBaseName}_${Date.now()}.${ext}`;
  const buffer = Buffer.from(await params.file.arrayBuffer());

  const { error } = await supabase.storage
    .from(TENANT_FILES_BUCKET)
    .upload(objectPath, buffer, {
      contentType: params.file.type || "application/octet-stream",
      upsert: false,
    });

  if (error) {
    throw error;
  }

  return objectPath;
}

export async function downloadPrivateObject(bucket: string, path: string) {
  const supabase = getSupabaseAdmin();
  return supabase.storage.from(bucket).download(path);
}

export async function deletePrivateObject(bucket: string, path: string) {
  const supabase = getSupabaseAdmin();
  const { error } = await supabase.storage.from(bucket).remove([path]);
  if (error) {
    throw error;
  }
}
