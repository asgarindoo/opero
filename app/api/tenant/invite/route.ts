import { Prisma } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/server/auth-utils";
import { requirePermission } from "@/lib/server/rbac";
import { generateInviteCode, generateInviteToken } from "@/lib/utils/invite-code";

const CreateInviteLinkSchema = z.object({
  expireDays: z.number().int().positive().max(365).nullable(),
});

function toInviteUrl(req: NextRequest, token: string) {
  const origin = req.headers.get("origin") ?? new URL(req.url).origin;
  return `${origin}/onboarding/join?invite=${token}`;
}

async function createUniqueInviteCode(organizationId: string) {
  for (let attempt = 0; attempt < 8; attempt++) {
    try {
      const inviteCode = generateInviteCode();
      await prisma.organization.update({
        where: { id: organizationId },
        data: { inviteCode },
      });
      return inviteCode;
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
        continue;
      }
      throw err;
    }
  }

  throw new Error("Unable to generate a unique invite code");
}

async function createUniqueInviteLink(organizationId: string, createdById: string, expiresAt: Date | null) {
  for (let attempt = 0; attempt < 8; attempt++) {
    try {
      return await prisma.tenantInviteLink.create({
        data: {
          token: generateInviteToken(),
          organizationId,
          createdById,
          expiresAt,
        },
        include: { createdBy: { select: { name: true, email: true } } },
      });
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
        continue;
      }
      throw err;
    }
  }

  throw new Error("Unable to generate a unique invite link");
}

export async function GET(req: NextRequest) {
  try {
    const { tenant } = await requirePermission("members.invite");

    let organization = await prisma.organization.findUnique({
      where: { id: tenant.id },
      select: { inviteCode: true },
    });

    if (!organization?.inviteCode) {
      const newCode = await createUniqueInviteCode(tenant.id);
      organization = { inviteCode: newCode };
    }

    const links = await prisma.tenantInviteLink.findMany({
      where: { organizationId: tenant.id, revokedAt: null },
      include: { createdBy: { select: { name: true, email: true } } },
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json({
      inviteCode: organization?.inviteCode,
      inviteLinks: links.map((link) => ({
        id: link.id,
        url: toInviteUrl(req, link.token),
        createdBy: link.createdBy.name || link.createdBy.email,
        createdAt: link.createdAt,
        expiresAt: link.expiresAt,
        uses: link.uses,
      })),
    });
  } catch (err) {
    if (err instanceof Response) return err;
    console.error("[GET /api/tenant/invite]", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await requireAuth();
    const { tenant } = await requirePermission("members.invite");
    const body = await req.json();
    const parsed = CreateInviteLinkSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: "Validation failed", details: parsed.error.flatten().fieldErrors },
        { status: 400 }
      );
    }

    const expiresAt = parsed.data.expireDays
      ? new Date(Date.now() + parsed.data.expireDays * 24 * 60 * 60 * 1000)
      : null;
    const link = await createUniqueInviteLink(tenant.id, user.id, expiresAt);

    return NextResponse.json({
      inviteLink: {
        id: link.id,
        url: toInviteUrl(req, link.token),
        createdBy: link.createdBy.name || link.createdBy.email,
        createdAt: link.createdAt,
        expiresAt: link.expiresAt,
        uses: link.uses,
      },
    });
  } catch (err) {
    if (err instanceof Response) return err;
    console.error("[POST /api/tenant/invite]", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
