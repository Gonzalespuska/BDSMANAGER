export const runtime = "edge";

import { NextResponse, type NextRequest } from "next/server";

/**
 * POST /api/admin/lead/reassign — DEPRECATED alias.
 *
 * Presunuté na `/api/lead/reassign` (unified endpoint pre admin+obchod
 * push/pull). Táto route iba forwarduje na nový endpoint aby staré
 * ReassignPicker (bez re-deploy) ďalej fungoval.
 */
export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({}));
  const url = new URL("/api/lead/reassign", request.url);
  const forwarded = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      // Forward cookies aby getCurrentAppUser() vedel kto som.
      Cookie: request.headers.get("cookie") ?? "",
    },
    body: JSON.stringify({ ...body, kind: body.kind ?? "push" }),
  });
  const text = await forwarded.text();
  return new NextResponse(text, {
    status: forwarded.status,
    headers: { "Content-Type": "application/json" },
  });
}
