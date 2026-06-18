import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/server/rbac";
import { normalizeUserAvatarImage } from "@/lib/server/supabase-storage";
import { getUserDisplayName } from "@/lib/user-identity";

export async function GET() {
  try {
    const { tenant, role } = await requirePermission("members.read");

    const members = await prisma.member.findMany({
      where: { organizationId: tenant.id },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
            image: true,
          },
        },
      },
      orderBy: { createdAt: "asc" },
    });

    const mappedMembers = members.map((m) => ({
      id: m.id,
      userId: m.userId,
      name: getUserDisplayName(m.user),
      email: m.user.email,
      image: normalizeUserAvatarImage(m.userId, m.user.image),
      role: m.role,
      department: m.department,
      position: m.position,
      status: m.status,
      joinedAt: m.createdAt,
      lastActive: m.lastActive,
    }));

    return NextResponse.json({ members: mappedMembers, currentRole: role });
  } catch (err) {
    if (err instanceof Response) return err;
    console.error("[GET /api/tenant/members]", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
