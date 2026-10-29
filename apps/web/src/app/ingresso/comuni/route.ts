import { NextResponse, type NextRequest } from "next/server";
import type { MunicipalitySuggestion } from "@/app/riferimenti/comuni/route";
import { publicApi } from "@/lib/public-api";

/**
 * Dan, 2026-10-29: the «Comune» suggestions of the entry, which has no account
 * (GET /onboarding/municipalities). Only names of places travel here.
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  const q = (request.nextUrl.searchParams.get("q") ?? "").trim().slice(0, 60);
  if (q.length < 2) return NextResponse.json([]);
  const { status, body } = await publicApi<MunicipalitySuggestion[]>(
    `/onboarding/municipalities?q=${encodeURIComponent(q)}`,
  );
  return NextResponse.json(status === 200 ? body : [], {
    headers: { "cache-control": "public, max-age=300" },
  });
}
