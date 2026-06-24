import { NextRequest, NextResponse } from "next/server";
import { unstable_rethrow } from "next/navigation";
import { z } from "zod";

const PayloadSchema = z.object({
  data: z.record(z.string(), z.unknown()),
});

type QueryParams = { limit?: number; offset?: number };

type DomainService = {
  list: (params?: QueryParams) => Promise<unknown[]>;
  get?: (id: string) => Promise<unknown | null>;
  create: (data: Record<string, unknown>) => Promise<unknown>;
  update: (id: string, data: Record<string, unknown>) => Promise<unknown | null>;
  remove: (id: string) => Promise<unknown | null>;
};

export function createDomainCollectionHandlers(service: Pick<DomainService, "list" | "create">) {
  return {
    async GET(req: NextRequest) {
      try {
        const { searchParams } = req.nextUrl;
        const rawLimit = searchParams.get("limit");
        const rawOffset = searchParams.get("offset");
        const params: QueryParams = {};
        if (rawLimit) {
          const limit = parseInt(rawLimit, 10);
          if (!isNaN(limit) && limit > 0) params.limit = limit;
        }
        if (rawOffset) {
          const offset = parseInt(rawOffset, 10);
          if (!isNaN(offset) && offset >= 0) params.offset = offset;
        }
        const items = await service.list(Object.keys(params).length > 0 ? params : undefined);
        return NextResponse.json({ items, total: items.length });
      } catch (err) {
        if (err instanceof Response) return err;
        unstable_rethrow(err);
        console.error(`[GET ${req.nextUrl.pathname}]`, err);
        return NextResponse.json({ error: "Internal server error" }, { status: 500 });
      }
    },

    async POST(req: NextRequest) {
      try {
        const body = await req.json();
        const parsed = PayloadSchema.safeParse(body);

        if (!parsed.success) {
          return NextResponse.json(
            { error: "Validation failed", details: parsed.error.flatten().fieldErrors },
            { status: 400 }
          );
        }

        const item = await service.create(parsed.data.data);
        return NextResponse.json({ item }, { status: 201 });
      } catch (err) {
        if (err instanceof Response) return err;
        unstable_rethrow(err);
        console.error(`[POST ${req.nextUrl.pathname}]`, err);
        return NextResponse.json({ error: err instanceof Error ? err.message : "Internal server error" }, { status: 500 });
      }
    },
  };
}

export function createDomainItemHandlers(service: Pick<DomainService, "update" | "remove"> & Pick<Partial<DomainService>, "get">) {
  return {
    async GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
      try {
        const { id } = await params;
        if (!service.get) return NextResponse.json({ error: "Not found" }, { status: 404 });
        const item = await service.get(id);
        if (!item) return NextResponse.json({ error: "Record not found" }, { status: 404 });
        return NextResponse.json({ item });
      } catch (err) {
        if (err instanceof Response) return err;
        unstable_rethrow(err);
        console.error(`[GET ${req.nextUrl.pathname}]`, err);
        return NextResponse.json({ error: "Internal server error" }, { status: 500 });
      }
    },

    async PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
      try {
        const { id } = await params;
        const body = await req.json();
        const parsed = PayloadSchema.safeParse(body);

        if (!parsed.success) {
          return NextResponse.json(
            { error: "Validation failed", details: parsed.error.flatten().fieldErrors },
            { status: 400 }
          );
        }

        const item = await service.update(id, parsed.data.data);
        if (!item) return NextResponse.json({ error: "Record not found" }, { status: 404 });
        return NextResponse.json({ item });
      } catch (err) {
        if (err instanceof Response) return err;
        unstable_rethrow(err);
        console.error(`[PATCH ${req.nextUrl.pathname}]`, err);
        return NextResponse.json({ error: "Internal server error" }, { status: 500 });
      }
    },

    async DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
      try {
        const { id } = await params;
        const item = await service.remove(id);
        if (!item) return NextResponse.json({ error: "Record not found" }, { status: 404 });
        return NextResponse.json({ success: true });
      } catch (err) {
        if (err instanceof Response) return err;
        unstable_rethrow(err);
        console.error(`[DELETE ${req.nextUrl.pathname}]`, err);
        return NextResponse.json({ error: "Internal server error" }, { status: 500 });
      }
    },
  };
}
