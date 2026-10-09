import { NextResponse } from "next/server";

type HealthContext = {
  container?: { database: { query: (statement: string) => Promise<unknown> } };
};

export async function GET(_request: Request, context?: HealthContext) {
  try {
    if (!context?.container) throw new Error("Application container unavailable");
    await context.container.database.query("select 1");
    return NextResponse.json({
      status: "ok",
      service: "cliqero-main",
      dependencies: { database: "ok" },
    });
  } catch {
    return NextResponse.json(
      {
        status: "unavailable",
        service: "cliqero-main",
        dependencies: { database: "unavailable" },
        error: "Service unavailable",
        code: "service_unavailable",
      },
      { status: 503 },
    );
  }
}
