import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/server/auth-utils";

const JoinSchema = z.object({
  inviteCode: z.string().regex(/^OP-[A-Z0-9]{4}-[A-Z0-9]{4}$/, "Invalid invite code format").optional(),
  inviteToken: z.string().regex(/^[a-f0-9]{48}$/i, "Invalid invite link").optional(),
}).refine((data) => Boolean(data.inviteCode || data.inviteToken), {
  message: "Invite code or link is required",
});

export async function POST(req: NextRequest) {
  try {
    const user = await requireAuth();
    const body = await req.json();
    const parsed = JoinSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid invite code format" },
        { status: 400 }
      );
    }

    const { inviteCode, inviteToken } = parsed.data;

    const organization = inviteCode
      ? await prisma.organization.findUnique({
          where: { inviteCode },
          select: { id: true, name: true, slug: true },
        })
      : null;

    const inviteLink = inviteToken
      ? await prisma.tenantInviteLink.findUnique({
          where: { token: inviteToken },
          select: {
            id: true,
            organizationId: true,
            expiresAt: true,
          revokedAt: true,
            organization: { select: { id: true, name: true, slug: true } },
          },
        })
      : null;

    const targetOrganization = organization ?? inviteLink?.organization;

    if (!targetOrganization) {
      return NextResponse.json(
        { error: "Invalid invite" },
        { status: 404 }
      );
    }

    if (inviteLink?.revokedAt || (inviteLink?.expiresAt && inviteLink.expiresAt <= new Date())) {
      return NextResponse.json({ error: "This invite link has expired" }, { status: 410 });
    }

    // Cek sudah member
    const existingMember = await prisma.member.findUnique({
      where: {
        organizationId_userId: {
          organizationId: targetOrganization.id,
          userId: user.id,
        },
      },
    });

    if (existingMember) {
      return NextResponse.json(
        { error: "You are already a member of this workspace" },
        { status: 400 }
      );
    }

    await prisma.$transaction(async (tx) => {
      await tx.member.create({
        data: {
          organizationId: targetOrganization.id,
          userId: user.id,
          role: "member",
          status: "active",
        },
      });

      if (inviteLink) {
        await tx.tenantInviteLink.update({
          where: { id: inviteLink.id },
          data: { uses: { increment: 1 } },
        });
      }
    });

    return NextResponse.json({
      success: true,
      organizationId: targetOrganization.id,
      organizationName: targetOrganization.name,
      organizationSlug: targetOrganization.slug,
    });
  } catch (err) {
    if (err instanceof Response) return err;
    console.error("[POST /api/tenant/join]", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
