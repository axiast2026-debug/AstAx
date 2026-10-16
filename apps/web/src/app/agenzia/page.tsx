import { formatDateTime } from "@astax/shared/format";
import { Badge, Button, Card, CardTitle } from "@astax/ui";
import { getTranslations } from "next-intl/server";
import { notFound } from "next/navigation";
import {
  createProduct,
  setProductActive,
  uploadProductDocument,
} from "@/app/agency-settings-actions";
import { AppShell } from "@/components/app-shell";
import { ErrorSummary, Field } from "@/components/form";
import { api } from "@/lib/auth";
import { requireViewer } from "@/lib/me";

const KINDS = ["PRODUCT_DIP", "PRODUCT_DIP_ADDITIONAL", "PRODUCT_CONDITIONS"] as const;

interface Library {
  canManage: boolean;
  companies: { id: string; name: string }[];
  products: {
    id: string;
    company: string;
    name: string;
    active: boolean;
    documents: Record<string, { id: string; uploadedAt: string } | null>;
  }[];
}

/**
 * «Agenzia» (spec 04): the verified mandates, the only companies of the
 * offers, and the product library with the information set of each product
 * (decision 17), which reaches the customer with the offer.
 */
export default async function AgencyPage({
  searchParams,
}: {
  searchParams: Promise<{ errore?: string; fatto?: string }>;
}) {
  const viewer = await requireViewer();
  if (viewer.activeMembership?.organization.type !== "AGENCY") notFound();
  const t = await getTranslations("agencySettings");
  const query = await searchParams;
  const { body: library } = await api<Library>("/agency/products");

  return (
    <AppShell viewer={viewer}>
      <h1 className="text-2xl font-bold">{t("agencyTitle")}</h1>
      <div className="mt-4">
        <ErrorSummary codes={query.errore} />
      </div>
      {query.fatto ? (
        <p role="status" className="mb-4 rounded-lg bg-green-50 p-3 text-sm">
          {t("saved")}
        </p>
      ) : null}
      <div className="grid gap-6">
        <Card>
          <CardTitle>{t("mandates")}</CardTitle>
          <p className="mt-1 text-sm text-warm-600">{t("mandatesIntro")}</p>
          <ul className="mt-3 list-disc pl-5 text-sm">
            {library.companies.map((c) => (
              <li key={c.id}>{c.name}</li>
            ))}
          </ul>
        </Card>

        <Card>
          <CardTitle>{t("products")}</CardTitle>
          <p className="mt-1 text-sm text-warm-600">{t("productsIntro")}</p>
          <div className="mt-4 space-y-4">
            {library.products.map((p) => (
              <section
                key={p.id}
                aria-label={`${p.company} · ${p.name}`}
                className="rounded-lg border border-warm-200 p-4"
              >
                <div className="flex flex-wrap items-center gap-3">
                  <h3 className="font-semibold">{`${p.company} · ${p.name}`}</h3>
                  <Badge tone={p.active ? "success" : "neutral"}>
                    {p.active ? t("active") : t("inactive")}
                  </Badge>
                </div>
                <ul className="mt-2 space-y-2 text-sm">
                  {KINDS.map((kind) => {
                    const doc = p.documents[kind];
                    return (
                      <li key={kind} className="flex flex-wrap items-center gap-3">
                        <span className="w-48">{t(`kinds.${kind}`)}</span>
                        {doc ? (
                          <a
                            href={`/agenzia/prodotti/${p.id}/documenti/${doc.id}`}
                            className="underline"
                            target="_blank"
                            rel="noreferrer"
                          >
                            {t("uploadedAt", { at: formatDateTime(doc.uploadedAt) })}
                          </a>
                        ) : (
                          <span className="text-orange-700">{t("missing")}</span>
                        )}
                        {library.canManage ? (
                          <form
                            action={uploadProductDocument}
                            encType="multipart/form-data"
                            className="flex items-center gap-2"
                          >
                            <input type="hidden" name="productId" value={p.id} />
                            <input type="hidden" name="kind" value={kind} />
                            <label className="sr-only" htmlFor={`f-${p.id}-${kind}`}>
                              {t("pdfFor", { kind: t(`kinds.${kind}`), product: p.name })}
                            </label>
                            <input
                              id={`f-${p.id}-${kind}`}
                              name="file"
                              type="file"
                              accept="application/pdf"
                              required
                              className="text-xs"
                            />
                            <Button type="submit" size="sm" variant="outline">
                              {doc ? t("replace") : t("upload")}
                            </Button>
                          </form>
                        ) : null}
                      </li>
                    );
                  })}
                </ul>
                {library.canManage ? (
                  <form action={setProductActive} className="mt-3">
                    <input type="hidden" name="productId" value={p.id} />
                    <input type="hidden" name="active" value={p.active ? "false" : "true"} />
                    <Button type="submit" size="sm" variant="outline">
                      {p.active ? t("deactivate") : t("activate")}
                    </Button>
                  </form>
                ) : null}
              </section>
            ))}
          </div>
          {library.canManage ? (
            <form action={createProduct} className="mt-6 grid gap-4 sm:grid-cols-3 sm:items-end">
              <div>
                <label htmlFor="f-companyId" className="block text-sm font-medium">
                  {t("company")}
                </label>
                <select
                  id="f-companyId"
                  name="companyId"
                  required
                  className="mt-1 block w-full rounded-lg border border-warm-200 bg-white px-3 py-2"
                >
                  {library.companies.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </div>
              <Field label={t("productName")} name="name" required maxLength={120} />
              <Button type="submit">{t("addProduct")}</Button>
            </form>
          ) : null}
        </Card>
      </div>
    </AppShell>
  );
}
