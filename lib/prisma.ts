import { PrismaClient } from "@prisma/client";
import { Pool } from "pg";
import { PrismaPg } from "@prisma/adapter-pg";

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

const connectionString = process.env.DATABASE_URL ?? "";

function getPoolMax() {
  const configured = Number(process.env.DATABASE_POOL_MAX ?? process.env.PG_POOL_MAX);
  if (Number.isInteger(configured) && configured > 0) return configured;

  return process.env.NODE_ENV === "production" ? 1 : 10;
}

function getSslConfig() {
  const configured = process.env.DATABASE_SSL?.toLowerCase();
  if (configured === "true") return { rejectUnauthorized: false };
  if (configured === "false") return false;

  const isSupabaseUrl = /(?:^|\.)(?:supabase\.co|pooler\.supabase\.com)/.test(connectionString);
  return process.env.NODE_ENV === "production" && isSupabaseUrl
    ? { rejectUnauthorized: false }
    : false;
}

const pool = new Pool({
  connectionString,
  ssl: getSslConfig(),
  connectionTimeoutMillis: 10000,
  idleTimeoutMillis: process.env.NODE_ENV === "production" ? 10000 : 30000,
  max: getPoolMax(),
});
const adapter = new PrismaPg(pool);

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    adapter,
    log: process.env.PRISMA_QUERY_LOG === "true" ? ["query", "error", "warn"] : ["error"],
  });

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
