"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { api } from "@/lib/auth";

/** LEG-06: the run on demand (the worker runs it every day). */
export async function runRetention(): Promise<void> {
  const { status, body } = await api<{ requests: number }>("/admin/retention/run", {
    method: "POST",
    body: "{}",
  });
  revalidatePath("/sicurezza-dati");
  if (status !== 200) redirect("/sicurezza-dati?errore=INTERNAL");
  redirect(`/sicurezza-dati?cancellate=${body.requests}`);
}
