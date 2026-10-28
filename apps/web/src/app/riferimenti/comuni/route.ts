import { NextResponse, type NextRequest } from "next/server";
import { api } from "@/lib/auth";

export interface MunicipalitySuggestion {
  istatCode: string;
  name: string;
  province: string;
  postalCodes: string[];
}

/**
 * Dan, 2026-10-28: the suggestions of the «Comune» field while typing, from
 * the ISTAT list with the CAPs (GET /reference/municipalities). Only names
 * of places travel here, never data of the customer.
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  const q = (request.nextUrl.searchParams.get("q") ?? "").trim().slice(0, 60);
  if (q.length < 2) return NextResponse.json([]);
  const { status, body } = await api<MunicipalitySuggestion[]>(
    `/reference/municipalities?q=${encodeURIComponent(q)}`,
  );
  return NextResponse.json(status === 200 ? body : [], {
    headers: { "cache-control": "private, max-age=300" },
  });
}
