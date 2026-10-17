"use server";

import { redirect } from "next/navigation";
import { publicApi } from "@/lib/public-api";

const TOKEN = /^[A-Za-z0-9_-]{40,60}$/;

/** The answers of the questionnaire after the sale: scores and a yes/no, no free text. */
export async function answerSurvey(formData: FormData): Promise<void> {
  const token = String(formData.get("token") ?? "");
  if (!TOKEN.test(token)) redirect("/");
  const score = (name: string) => Number(formData.get(name) ?? 0);
  const { status } = await publicApi(`/surveys/${token}`, {
    method: "POST",
    body: JSON.stringify({
      overall: score("overall"),
      clarity: score("clarity"),
      agency: score("agency"),
      contactedByOthers: formData.get("contactedByOthers") === "yes",
    }),
  });
  redirect(`/questionario/${token}?${status === 200 ? "grazie=1" : "errore=1"}`);
}
