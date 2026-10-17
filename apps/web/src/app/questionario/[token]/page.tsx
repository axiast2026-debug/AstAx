import { Button, Card } from "@astax/ui";
import { getTranslations } from "next-intl/server";
import { notFound } from "next/navigation";
import { publicApi } from "@/lib/public-api";
import { answerSurvey } from "../actions";

const QUESTIONS = ["overall", "clarity", "agency"] as const;

/**
 * The questionnaire after the sale (process 4), from the emailed link: no
 * account. Three scores and whether someone proposed an insurance outside
 * AstAx: a «sì» becomes a flag for the back office.
 */
export default async function SurveyPage({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>;
  searchParams: Promise<{ grazie?: string; errore?: string }>;
}) {
  const { token } = await params;
  if (!/^[A-Za-z0-9_-]{40,60}$/.test(token)) notFound();
  const query = await searchParams;
  const t = await getTranslations("survey");
  const { status, body } = await publicApi<{ answered: boolean }>(`/surveys/${token}`);
  if (status !== 200) notFound();

  return (
    <main className="mx-auto max-w-2xl px-4 py-10">
      <p className="text-lg font-bold">{t("brand")}</p>
      <h1 className="mt-4 text-2xl font-bold">{t("title")}</h1>
      {query.errore ? (
        <p role="alert" className="mt-4 rounded-lg bg-red-50 p-3 text-sm text-red-700">
          {t("error")}
        </p>
      ) : null}
      {body.answered || query.grazie ? (
        <Card className="mt-6">
          <p role="status">{t("thanks")}</p>
        </Card>
      ) : (
        <Card className="mt-6">
          <form action={answerSurvey} className="grid gap-6">
            <input type="hidden" name="token" value={token} />
            {QUESTIONS.map((q) => (
              <fieldset key={q} className="grid gap-2">
                <legend className="font-medium">{t(`question.${q}`)}</legend>
                <div className="flex flex-wrap gap-4">
                  {[1, 2, 3, 4, 5].map((n) => (
                    <label key={n} className="flex items-center gap-1">
                      <input type="radio" name={q} value={n} required />
                      {n}
                    </label>
                  ))}
                </div>
                <p className="text-sm text-warm-600">{t("scale")}</p>
              </fieldset>
            ))}
            <fieldset className="grid gap-2">
              <legend className="font-medium">{t("question.contactedByOthers")}</legend>
              <label className="flex items-center gap-2">
                <input type="radio" name="contactedByOthers" value="no" required />
                {t("no")}
              </label>
              <label className="flex items-center gap-2">
                <input type="radio" name="contactedByOthers" value="yes" />
                {t("yes")}
              </label>
              <p className="text-sm text-warm-600">{t("contactedHint")}</p>
            </fieldset>
            <Button type="submit" className="justify-self-start">
              {t("send")}
            </Button>
          </form>
        </Card>
      )}
    </main>
  );
}
