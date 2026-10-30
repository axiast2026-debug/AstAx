import { Button, Card, CardTitle } from "@astax/ui";
import { getTranslations } from "next-intl/server";
import { redirect } from "next/navigation";
import { chooseContext } from "@/app/actions";
import { api } from "@/lib/auth";
import type { Me } from "@/lib/me";
import { Info } from "@/components/info";

/** Context selector for people working for several organizations (decisione aggiunta 4). */
export default async function ContextPage() {
  const t = await getTranslations();
  const { body: me } = await api<Me>("/me");
  if (me.kind === "PRIVATE") redirect("/");
  return (
    <main className="mx-auto max-w-2xl px-4 py-12">
      <h1 className="text-2xl font-bold">
        {t("context.title")}
        <Info>{t("context.text")}</Info>
      </h1>
      <div className="mt-6 space-y-3">
        {me.memberships.map((m) => (
          <Card key={m.id} className="flex items-center justify-between gap-4">
            <div>
              <CardTitle>{m.organization.name}</CardTitle>
              <p className="text-sm text-warm-600">
                {t(`organizationTypes.${m.organization.type}`)} · {t(`roles.${m.role}`)}
              </p>
            </div>
            <form action={chooseContext}>
              <input type="hidden" name="membershipId" value={m.id} />
              <Button type="submit">{t("context.choose")}</Button>
            </form>
          </Card>
        ))}
      </div>
    </main>
  );
}
