

import "dotenv/config";
import { defineConfig } from "prisma/config";

// Fallback ke DATABASE_URL buat local dev
const migrationUrl =
  process.env.MIGRATION_DATABASE_URL ??
  (process.env.NODE_ENV === "production"
    ? process.env.DIRECT_URL ?? process.env.DATABASE_URL
    : process.env.DATABASE_URL ?? process.env.DIRECT_URL) ??
  "";

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  datasource: {
    url: migrationUrl,
  },
});
