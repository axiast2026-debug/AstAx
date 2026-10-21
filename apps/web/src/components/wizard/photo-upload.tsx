import { getTranslations } from "next-intl/server";
import { fieldId } from "@/components/form";
import { AutoSubmitFile } from "./auto-submit-file";

/**
 * One photo of the simplified request (Dan, 2026-10-21): sent as soon as it
 * is chosen, with the camera on a phone; if the bot cannot read it the
 * customer is told at once to take it again (ADR 0013).
 */
export async function PhotoUpload({
  requestId,
  base,
  step,
  kind,
  driverIndex,
  title,
  intro,
  current,
  unreadable,
  action,
}: {
  requestId: string;
  base: string;
  step: string;
  kind: string;
  driverIndex?: number;
  title: string;
  intro: string;
  current: string | undefined;
  unreadable: boolean;
  action: (formData: FormData) => Promise<void>;
}) {
  const t = await getTranslations("wizard.upload");
  const id = fieldId(`photo-${kind}`);
  return (
    <form
      action={action}
      className={`rounded-xl border p-4 sm:p-6 ${
        unreadable
          ? "border-red-600 bg-red-50"
          : current
            ? "border-green-600 bg-white"
            : "border-dashed border-warm-200 bg-warm-50"
      }`}
    >
      <input type="hidden" name="requestId" value={requestId} />
      <input type="hidden" name="base" value={base} />
      <input type="hidden" name="step" value={step} />
      <input type="hidden" name="kind" value={kind} />
      {driverIndex === undefined ? null : (
        <input type="hidden" name="driverIndex" value={driverIndex} />
      )}
      <h3 className="text-base font-semibold text-night-900">{title}</h3>
      <p className="mt-1 text-sm text-warm-600">{intro}</p>
      {unreadable ? (
        <p role="alert" className="mt-2 text-sm font-semibold text-red-700">
          {t("unreadable")}
        </p>
      ) : current ? (
        <p className="mt-2 text-sm text-green-700">{t("received", { name: current })}</p>
      ) : null}
      <label
        htmlFor={id}
        className="mt-3 inline-flex h-12 w-full cursor-pointer items-center justify-center rounded-lg bg-night-900 px-6 text-base font-medium text-white hover:bg-night-800 sm:w-auto"
      >
        {current ? t("retake") : t("take")}
      </label>
      <AutoSubmitFile id={id} />
    </form>
  );
}
