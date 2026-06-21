import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  allowedDevOrigins: ["lvh.me", "*.lvh.me"],

  // Production optimizations
  compress: true,
  poweredByHeader: false,

  // Jangan bundle modul native/server — mempercepat cold start Vercel
  serverExternalPackages: ["@prisma/client", "pg", "@prisma/adapter-pg"],
};

export default nextConfig;
