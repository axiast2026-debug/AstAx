import { Button, Card, CardTitle } from "@astax/ui";
import { getTranslations } from "next-intl/server";
import { notFound } from "next/navigation";
import { fakeSign } from "@/app/acceptance-actions";
import { ErrorSummary, Field } from "@/components/form";
import { publicApi } from "@/lib/public-api";

/**
 * The fake signature provider's page (rule 9, proposal A of phase 5): what
 * the real provider's site would show. The API answers only while the
 * provider is the fake one, never in production.
 */
export default async function FakeSignaturePage({
  params,
  searchParams,
}: {
  params: Promise<{ ref: string }>;
  searchParams: Promise<{ errore?: string }>;
}) {
  const { ref } = await params;
  if (!/^[a-z]+-[0-9a-f-]{36,80}$/.test(ref)) notFound();
  const query = await searchParams;
  const t = await getTranslations("fakeSignature");
  const { status, body } = await publicApi<{ titles: string[] }>(
    `/fake-providers/signature/${ref}`,
  );
  if (status !== 200) notFound();
  return (
    <main className="mx-auto max-w-xl px-4 py-10">
      <h1 className="text-2xl font-bold">{t("title")}</h1>
      <p className="mt-2 text-sm text-warm-600">{t("intro")}</p>
      <div className="mt-6">
        <ErrorSummary codes={query.errore} />
      </div>
      <Card className="mt-6">
        <CardTitle>{t("documents")}</CardTitle>
        <ul className="mt-2 list-disc pl-5 text-sm">
          {body.titles.map((title) => (
            <li key={title}>{title}</li>
          ))}
        </ul>
        <form action={fakeSign} className="mt-4 space-y-3">
          <input type="hidden" name="ref" value={ref} />
          <Field
            label={t("code")}
            name="code"
            inputMode="numeric"
            autoComplete="one-time-code"
            pattern="\d{6}"
            required
          />
          <Button type="submit">{t("sign")}</Button>
        </form>
      </Card>
    </main>
  );
}
