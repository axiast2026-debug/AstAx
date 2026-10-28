import { Card } from "@astax/ui";
import { getTranslations } from "next-intl/server";
import { notFound } from "next/navigation";
import { AniaScreen } from "@/components/ania-screen";
import { AppShell } from "@/components/app-shell";
import { api } from "@/lib/auth";
import { requireViewer } from "@/lib/me";

/**
 * Dan, 2026-10-28: the back office logs in to the agencies' portal here, on
 * the browser of the ANIA reader; «Leggi da ANIA» then uses that session.
 */
export default async function AniaPortalPage() {
  const viewer = await requireViewer();
  const t = await getTranslations("verification.portal");
  const { status, body } = await api<{ real: boolean }>("/verification/ania-login/status");
  if (status === 403 || status === 404) notFound();

  return (
    <AppShell viewer={viewer}>
      <h1 className="font-display text-screen font-extrabold">{t("title")}</h1>
      <p className="mt-2 max-w-3xl text-sm text-warm-700">{t("intro")}</p>
      <Card className="mt-4">
        {body.real ? (
          <AniaScreen
            texts={{
              opening: t("opening"),
              error: t("error"),
              states: {
                LOGIN: t("states.LOGIN"),
                READY: t("states.READY"),
                BLOCKED: t("states.BLOCKED"),
                UNKNOWN: t("states.UNKNOWN"),
              },
              focus: t("focus"),
              focused: t("focused"),
              typeHere: t("typeHere"),
              send: t("send"),
              enter: t("enter"),
              tab: t("tab"),
              backspace: t("backspace"),
              reload: t("reload"),
              alt: t("alt"),
            }}
          />
        ) : (
          <p className="text-sm">{t("fake")}</p>
        )}
      </Card>
    </AppShell>
  );
}
