import { apiFile } from "@/lib/api-file";

const DAY = /^\d{4}-\d{2}-\d{2}$/;
const PATHS: Record<string, string> = {
  requests: "/admin/reports/requests",
  accounting: "/admin/reports/accounting",
  audit: "/admin/audit/export",
};

/** The CSV exports of «Report ed esportazioni» (each one logged by the API). */
export async function GET(request: Request, context: { params: Promise<{ kind: string }> }) {
  const { kind } = await context.params;
  const url = new URL(request.url);
  const from = url.searchParams.get("da") ?? "";
  const to = url.searchParams.get("a") ?? "";
  const path = PATHS[kind];
  if (!path || !DAY.test(from) || !DAY.test(to)) return new Response(null, { status: 400 });
  return apiFile(`${path}?from=${from}&to=${to}`);
}
