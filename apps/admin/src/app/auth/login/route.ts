import { NextResponse } from "next/server";
import { webAuth } from "@/lib/auth";

/** Back office login: password and TOTP through the astax-admin client. */
export async function GET(): Promise<NextResponse> {
  return NextResponse.redirect(await webAuth().beginLogin("staff"));
}
