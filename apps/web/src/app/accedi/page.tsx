import { redirect } from "next/navigation";
import { LoginChoice } from "@/components/login-choice";
import { sessionId, webAuth } from "@/lib/auth";

/** «Accedi» (Momento 1): the two ways in, now that the home is public. */
export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ scaduta?: string }>;
}) {
  if (await webAuth().session(await sessionId())) redirect("/");
  return <LoginChoice expired={(await searchParams).scaduta === "1"} />;
}
