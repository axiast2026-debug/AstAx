import { Badge, Button, Card, CardTitle } from "@astax/ui";
import { getTranslations } from "next-intl/server";
import { redirect } from "next/navigation";
import { acceptLegal } from "@/app/actions";
import { api } from "@/lib/auth";

interface PendingDocument {
  documentKey: string;
  title: string;
  versionId: string;
  versionNumber: number;
  contentMd: string;
  validated: boolean;
}

/** Legal texts in force to accept before going on (LEG-01, LEG-02, LEG-03). */
export default async function LegalPage() {
  const t = await getTranslations("legal");
  const { body: pending } = await api<PendingDocument[]>("/legal/pending");
  if (pending.length === 0) redirect("/");
  return (
    <main className="mx-auto max-w-3xl px-4 py-12">
      <h1 className="text-2xl font-bold">{t("title")}</h1>
      <p className="mt-2 text-warm-600">{t("intro")}</p>
      <form action={acceptLegal} className="mt-6 space-y-4">
        {pending.map((doc) => (
          <Card key={doc.versionId}>
            <div className="flex items-center justify-between gap-2">
              <CardTitle>{doc.title}</CardTitle>
              <span className="text-sm text-warm-600">
                {t("version", { number: doc.versionNumber })}
              </span>
            </div>
            {doc.validated ? null : (
              <Badge tone="warning" className="mt-2">
                {t("notValidated")}
              </Badge>
            )}
            <pre className="mt-4 max-h-64 overflow-auto whitespace-pre-wrap rounded-lg bg-warm-100 p-4 font-sans text-sm">
              {doc.contentMd}
            </pre>
            <input type="hidden" name="versionId" value={doc.versionId} />
          </Card>
        ))}
        <Button type="submit" size="lg">
          {t("accept")}
        </Button>
      </form>
    </main>
  );
}
