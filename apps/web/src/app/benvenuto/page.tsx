import { Button } from "@astax/ui";
import { getTranslations } from "next-intl/server";
import { redirect } from "next/navigation";
import { saveProfile } from "@/app/actions";
import { ActionForm } from "@/components/action-form";
import { Field } from "@/components/form";
import { profileComplete, requireViewer } from "@/lib/me";

/**
 * Dan, 2026-10-28: at the first access, after the legal texts, a private
 * customer gives name, surname and mobile phone; then the home says «Ciao».
 */
export default async function WelcomePage() {
  const viewer = await requireViewer({ allowIncompleteProfile: true });
  if (viewer.me.kind !== "PRIVATE" || profileComplete(viewer.me)) redirect("/");
  const t = await getTranslations("welcome");
  const { me } = viewer;
  return (
    <main className="mx-auto max-w-xl px-4 py-12">
      <h1 className="font-display text-screen font-extrabold">{t("title")}</h1>
      <p className="mt-2 text-body text-warm-800">{t("intro")}</p>
      <ActionForm action={saveProfile} className="mt-6 space-y-4">
        <Field
          label={t("firstName")}
          name="firstName"
          defaultValue={me.firstName}
          autoComplete="given-name"
          required
          maxLength={80}
        />
        <Field
          label={t("lastName")}
          name="lastName"
          defaultValue={me.lastName}
          autoComplete="family-name"
          required
          maxLength={80}
        />
        <Field
          label={t("phone")}
          name="phone"
          type="tel"
          inputMode="tel"
          defaultValue={me.phone ?? ""}
          autoComplete="tel"
          hint={t("phoneHint")}
          required
          maxLength={30}
        />
        <Button type="submit" className="w-full sm:w-auto">
          {t("submit")}
        </Button>
      </ActionForm>
    </main>
  );
}
