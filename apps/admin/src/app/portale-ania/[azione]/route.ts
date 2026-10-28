import { browserClient, sessionId, webAuth } from "@/lib/auth";

/**
 * Dan, 2026-10-28: the screen of the ANIA reader's login, through the API,
 * which checks the operator and logs the opening. What the operator types
 * goes straight on and is never kept.
 */
const PATHS = {
  stato: { method: "GET", path: "status" },
  apri: { method: "POST", path: "open" },
  schermo: { method: "GET", path: "screen" },
  azione: { method: "POST", path: "action" },
} as const;

async function forward(request: Request, azione: string): Promise<Response> {
  const target = PATHS[azione as keyof typeof PATHS];
  if (!target || target.method !== request.method) return new Response(null, { status: 404 });
  // Only from the back office's own pages: another site cannot type into the portal.
  const origin = request.headers.get("origin");
  if (
    target.method === "POST" &&
    (!origin || new URL(origin).host !== request.headers.get("host"))
  ) {
    return new Response(null, { status: 403 });
  }
  let response: Response;
  try {
    response = await webAuth().api(
      await sessionId(),
      `/verification/ania-login/${target.path}`,
      target.method === "POST"
        ? {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: (await request.text()).slice(0, 2000) || "{}",
          }
        : {},
      await browserClient(),
    );
  } catch {
    return new Response(null, { status: 401 });
  }
  return new Response(response.body, {
    status: response.status,
    headers: {
      "content-type": response.headers.get("content-type") ?? "application/json",
      "cache-control": "private, no-store",
      "x-content-type-options": "nosniff",
    },
  });
}

export async function GET(request: Request, context: { params: Promise<{ azione: string }> }) {
  return forward(request, (await context.params).azione);
}

export async function POST(request: Request, context: { params: Promise<{ azione: string }> }) {
  return forward(request, (await context.params).azione);
}
