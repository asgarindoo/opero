import { betterAuth } from "better-auth";
import { organization } from "better-auth/plugins";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { generateInviteCode } from "@/lib/utils/invite-code";

const rootAuthUrl =
  process.env.BETTER_AUTH_URL ??
  process.env.NEXT_PUBLIC_ROOT_URL ??
  "http://lvh.me:3000";
const rootHostname = new URL(rootAuthUrl).hostname;
const rootDomain = process.env.NEXT_PUBLIC_ROOT_DOMAIN ?? rootHostname;
const isLoopbackHost = rootHostname === "localhost" || rootHostname === "127.0.0.1";

// Localhost tidak bisa share cookie antar subdomain
const cookieDomain = !isLoopbackHost
  ? (process.env.BETTER_AUTH_COOKIE_DOMAIN ?? rootDomain)
  : undefined;

async function assignUniqueInviteCode(organizationId: string) {
  for (let attempt = 0; attempt < 8; attempt++) {
    try {
      await prisma.organization.update({
        where: { id: organizationId },
        data: { inviteCode: generateInviteCode() },
      });
      return;
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
        continue;
      }
      throw err;
    }
  }

  throw new Error("Unable to generate a unique tenant invite code");
}

export const auth = betterAuth({
  baseURL: rootAuthUrl,

  database: prismaAdapter(prisma, {
    provider: "postgresql",
  }),

  emailAndPassword: {
    enabled: true,
    requireEmailVerification: false, // aktifkan di production
    minPasswordLength: 8,
  },

  session: {
    expiresIn: 60 * 60 * 24 * 30, // 30 hari
    updateAge: 60 * 60 * 24,
    // Cookie cache: simpan session terenkripsi di cookie agar tidak perlu DB
    // untuk setiap request. maxAge pendek (5 menit) menjaga ukuran cookie kecil
    // dan session tetap fresh. Jika header terlalu besar, set ke false.
    cookieCache: {
      enabled: true,
      maxAge: 60 * 5, // 5 menit
    },
  },

  plugins: [
    organization({
      allowUserToCreateOrganization: true,
      membershipLimit: 200,

      // TODO: kirim email beneran nanti
      async sendInvitationEmail(data) {
        console.log(
          `[OPERO] Invitation created for ${data.email} to join "${data.organization.name}"`,
          `\n  Invite ID: ${data.id}`,
          `\n  Invited by: ${data.inviter.user.email}`
        );
      },

      organizationHooks: {
        afterCreateOrganization: async ({ organization: org }) => {
          try {
            await assignUniqueInviteCode(org.id);

            // Upsert free plan kalau belum ada
            const freePlan = await prisma.subscriptionPlan.upsert({
              where: { name: "free" },
              create: {
                name: "free",
                displayName: "Free",
                maxMembers: 1,
              },
              update: {},
            });

            await prisma.tenantSettings.create({
              data: { organizationId: org.id },
            });

            await prisma.tenantPlan.create({
              data: {
                organizationId: org.id,
                planId: freePlan.id,
                status: "active",
              },
            });
          } catch (err) {
            // Non-fatal, jangan block org creation
            console.error("[OPERO] Failed to seed tenant settings:", err);
          }
        },
      },
    }),
  ],

  trustedOrigins: [
    rootAuthUrl,
    "http://*.localhost:3000",
    "http://lvh.me:3000",
    "http://*.lvh.me:3000",
    ...(rootDomain ? [`https://*.${rootDomain}`, `http://*.${rootDomain}`] : []),
  ],

  ...(cookieDomain
    ? {
      advanced: {
        crossSubDomainCookies: {
          enabled: true,
          domain: cookieDomain,
        },
      },
    }
    : {}),
});

export type Auth = typeof auth;
