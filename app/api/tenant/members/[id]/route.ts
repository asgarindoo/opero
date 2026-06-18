import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { canManageMembers, requirePermission } from "@/lib/server/rbac";
import { normalizeUserAvatarImage } from "@/lib/server/supabase-storage";
import { getUserDisplayName } from "@/lib/user-identity";

const UpdateMemberSchema = z.object({
  role: z.enum(["owner", "admin", "member"]).optional(),
  department: z.string().max(100).optional(),
  position: z.string().max(100).optional(),
  status: z.enum(["active", "suspended"]).optional(),
});

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { tenant, role: currentUserRole } = await requirePermission("members.manage");
    const { id: memberId } = await params;
    
    const body = await req.json();
    const parsed = UpdateMemberSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: "Validation failed", details: parsed.error.flatten().fieldErrors },
        { status: 400 }
      );
    }

    const member = await prisma.member.findUnique({
      where: { id: memberId },
    });

    if (!member || member.organizationId !== tenant.id) {
      return NextResponse.json({ error: "Member not found" }, { status: 404 });
    }

    if (!canManageMembers(currentUserRole, member.role, parsed.data.role)) {
      return NextResponse.json({ error: "Insufficient permissions to modify this member" }, { status: 403 });
    }

    if (member.role === "owner" && parsed.data.role && parsed.data.role !== "owner") {
      const ownerCount = await prisma.member.count({
        where: { organizationId: tenant.id, role: "owner" },
      });
      if (ownerCount <= 1) {
        return NextResponse.json({ error: "Cannot remove the last owner of the workspace" }, { status: 400 });
      }
    }

    const updated = await prisma.member.update({
      where: { id: memberId },
      data: parsed.data,
      include: {
        user: {
          select: { name: true, email: true, image: true }
        }
      }
    });

    return NextResponse.json({ 
      member: {
        id: updated.id,
        userId: updated.userId,
        name: getUserDisplayName(updated.user),
        email: updated.user.email,
        image: normalizeUserAvatarImage(updated.userId, updated.user.image),
        role: updated.role,
        department: updated.department,
        position: updated.position,
        status: updated.status,
        joinedAt: updated.createdAt,
        lastActive: updated.lastActive,
      } 
    });
  } catch (err) {
    if (err instanceof Response) return err;
    console.error("[PATCH /api/tenant/members/[id]]", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { tenant, role: currentUserRole } = await requirePermission("members.manage");
    const { id: memberId } = await params;

    const member = await prisma.member.findUnique({
      where: { id: memberId },
    });

    if (!member || member.organizationId !== tenant.id) {
      return NextResponse.json({ error: "Member not found" }, { status: 404 });
    }

    if (!canManageMembers(currentUserRole, member.role)) {
      return NextResponse.json({ error: "Only owners can remove admins or other owners" }, { status: 403 });
    }

    if (member.role === "owner") {
      const ownerCount = await prisma.member.count({
        where: { organizationId: tenant.id, role: "owner" },
      });
      if (ownerCount <= 1) {
        return NextResponse.json({ error: "Cannot remove the last owner of the workspace" }, { status: 400 });
      }
    }

    await prisma.member.delete({
      where: { id: memberId },
    });

    return NextResponse.json({ success: true });
  } catch (err) {
    if (err instanceof Response) return err;
    console.error("[DELETE /api/tenant/members/[id]]", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
