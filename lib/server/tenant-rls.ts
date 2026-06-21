import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import type { TenantContext } from "@/lib/server/auth-utils";

export async function tenantRls<T>(
  ctx: TenantContext,
  fn: (tx: Prisma.TransactionClient) => Promise<T>
): Promise<T> {
  return prisma.$transaction(async (tx) => {
    // Satu round-trip untuk set semua 3 config sekaligus
    await tx.$executeRaw`
      SELECT
        set_config('app.organization_id', ${ctx.tenantId}, true),
        set_config('app.user_id', ${ctx.userId}, true),
        set_config('app.role', ${ctx.role}, true)
    `;

    return fn(tx);
  });
}
