import { apiFile } from "@/lib/api-file";

const DAY = /^\d{4}-\d{2}-\d{2}$/;

/** The CSV for IVASS (the export is logged by the API). */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const from = url.searchParams.get("da") ?? "";
  const to = url.searchParams.get("a") ?? "";
  if (!DAY.test(from) || !DAY.test(to)) return new Response(null, { status: 400 });
  return apiFile(`/back-office/complaints/export?from=${from}&to=${to}`);
}
