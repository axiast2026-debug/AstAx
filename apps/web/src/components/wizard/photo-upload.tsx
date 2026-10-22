import { buttonVariants, Icon } from "@astax/ui";
import { getTranslations } from "next-intl/server";
import { fieldId } from "@/components/form";
import { AutoSubmitFile } from "./auto-submit-file";

/**
 * One photo of the simplified request (Dan, 2026-10-21): sent as soon as it
 * is chosen, with the camera on a phone; if the bot cannot read it the
 * customer is told at once to take it again (ADR 0013). Three looks (design
 * system, PhotoUpload): to take (dashed), read (green tick), unreadable (warning).
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
  const look = unreadable
    ? "bg-warning-50 shadow-[inset_0_0_0_1px_var(--color-warning-700)]"
    : current
      ? "bg-white shadow-[inset_0_0_0_1px_var(--color-warm-200)]"
      : "border-2 border-dashed border-warm-600 bg-warm-50";
  return (
    <form action={action} className={`flex flex-col gap-3 rounded-2xl p-4 sm:p-6 ${look}`}>
      <input type="hidden" name="requestId" value={requestId} />
      <input type="hidden" name="base" value={base} />
      <input type="hidden" name="step" value={step} />
      <input type="hidden" name="kind" value={kind} />
      {driverIndex === undefined ? null : (
        <input type="hidden" name="driverIndex" value={driverIndex} />
      )}
      <div className="flex items-start gap-3">
        <span
          aria-hidden
          className={`inline-flex size-10 shrink-0 items-center justify-center rounded-xl ${
            unreadable
              ? "bg-white text-warning-700"
              : current
                ? "bg-green-50 text-green-700"
                : "bg-white text-night-900"
          }`}
        >
          <Icon name={unreadable ? "warning" : current ? "check" : "camera"} size={22} />
        </span>
        <span className="flex flex-col gap-0.5">
          <h3 className="text-body font-bold text-night-900">{title}</h3>
          {unreadable ? (
            <p role="alert" className="text-table font-semibold text-warning-700">
              {t("unreadable")}
            </p>
          ) : current ? (
            <p className="text-table text-green-700">{t("received", { name: current })}</p>
          ) : (
            <p className="text-table text-warm-600">{intro}</p>
          )}
        </span>
      </div>
      <label
        htmlFor={id}
        className={buttonVariants({
          variant: current && !unreadable ? "ghost" : unreadable ? "outline" : "secondary",
          size: "lg",
          full: true,
          className: "cursor-pointer sm:w-auto sm:self-start",
        })}
      >
        <Icon name="camera" />
        {current ? t("retake") : t("take")}
      </label>
      <AutoSubmitFile id={id} />
    </form>
  );
}
