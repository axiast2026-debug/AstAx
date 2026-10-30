import { Icon } from "@astax/ui";
import { getTranslations } from "next-intl/server";

/**
 * ADR 0027: where the signature service sends the intermediary's customer
 * after signing the offer already bought. No token and no data: the link
 * page still shows the state to whoever has the link and the code.
 */
export default async function SignedPage() {
  const t = await getTranslations("customerOffer");
  const ta = await getTranslations("acceptance");
  return (
    <div className="min-h-screen">
      <header className="bg-night-900 text-white">
        <div className="mx-auto flex max-w-3xl items-center px-4 py-3">
          <span className="text-lg font-bold tracking-tight">{t("brand")}</span>
        </div>
      </header>
      <main className="mx-auto flex max-w-3xl flex-col gap-4 px-4 py-6 lg:py-10">
        <h1 className="flex items-center gap-2 font-display text-screen font-extrabold">
          <Icon name="checkCircle" size={28} className="text-green-700" />
          {ta("boughtSignedTitle")}
        </h1>
        <p className="text-body">{ta("boughtSignedText")}</p>
      </main>
    </div>
  );
}
