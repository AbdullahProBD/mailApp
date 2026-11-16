import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/** Public liveness check. Intentionally returns no configuration or dependency data. */
export function GET(): NextResponse<{ status: "ok" }> {
  return NextResponse.json(
    { status: "ok" },
    {
      status: 200,
      headers: {
        "Cache-Control": "no-store, max-age=0",
      },
    },
  );
}
