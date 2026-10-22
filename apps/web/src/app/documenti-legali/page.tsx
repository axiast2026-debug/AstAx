import { Badge, Button, Icon } from "@astax/ui";
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

/**
 * Legal texts in force to accept before going on (LEG-01, LEG-02, LEG-03;
 * primo accesso of the design): each with its version, the placeholder mark
 * until the lawyer validates it (rule 10).
 */
export default async function LegalPage() {
  const t = await getTranslations("legal");
  const { body: pending } = await api<PendingDocument[]>("/legal/pending");
  if (pending.length === 0) redirect("/");
  return (
    <main className="mx-auto max-w-3xl px-4 py-12">
      <h1 className="font-display text-screen font-extrabold">{t("title")}</h1>
      <p className="mt-2 text-body text-warm-800">{t("intro")}</p>
      <form action={acceptLegal} className="mt-6 space-y-4">
        {pending.map((doc) => (
          <section
            key={doc.versionId}
            aria-label={doc.title}
            className="rounded-2xl bg-white p-5 shadow-[inset_0_0_0_1px_var(--color-warm-200)]"
          >
            <div className="flex items-center gap-3">
              <span
                aria-hidden
                className="inline-flex size-10 shrink-0 items-center justify-center rounded-xl bg-warm-100 text-night-900"
              >
                <Icon name="document" size={20} />
              </span>
              <span className="flex flex-col">
                <h2 className="text-body font-bold">{doc.title}</h2>
                <span className="text-note text-warm-600">
                  {t("version", { number: doc.versionNumber })}
                </span>
              </span>
            </div>
            {doc.validated ? null : (
              <Badge tone="warning" className="mt-2">
                {t("notValidated")}
              </Badge>
            )}
            <pre
              tabIndex={0}
              className="mt-4 max-h-64 overflow-auto whitespace-pre-wrap rounded-lg bg-warm-50 p-4 font-sans text-table shadow-[inset_0_0_0_1px_var(--color-warm-200)]"
            >
              {doc.contentMd}
            </pre>
            <input type="hidden" name="versionId" value={doc.versionId} />
          </section>
        ))}
        <p className="text-note text-warm-600">{t("recorded")}</p>
        <Button type="submit" size="lg">
          {t("accept")}
        </Button>
      </form>
    </main>
  );
}
