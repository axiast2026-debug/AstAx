import { Button } from "@astax/ui";
import { getTranslations } from "next-intl/server";
import { fieldId } from "@/components/form";

/** One document to upload (photo or PDF); the reader fills the form after the upload. */
export async function DocumentUpload({
  requestId,
  base,
  step,
  kind,
  driverIndex,
  title,
  intro,
  current,
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
  action: (formData: FormData) => Promise<void>;
}) {
  const t = await getTranslations("wizard.upload");
  const id = fieldId(`file-${kind}-${driverIndex ?? ""}`);
  return (
    <form
      action={action}
      className="rounded-xl border border-dashed border-warm-200 bg-warm-50 p-4 sm:p-6"
    >
      <input type="hidden" name="requestId" value={requestId} />
      <input type="hidden" name="base" value={base} />
      <input type="hidden" name="step" value={step} />
      <input type="hidden" name="kind" value={kind} />
      {driverIndex === undefined ? null : (
        <input type="hidden" name="driverIndex" value={driverIndex} />
      )}
      <h2 className="text-base font-semibold text-night-900">{title}</h2>
      <p className="mt-1 text-sm text-warm-600">{intro}</p>
      {current ? <p className="mt-2 text-sm">{t("current", { name: current })}</p> : null}
      <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-end">
        <div className="flex-1">
          <label htmlFor={id} className="block text-sm font-medium text-night-900">
            {t("file")}
          </label>
          <input
            id={id}
            name="file"
            type="file"
            accept="image/jpeg,image/png,image/webp,application/pdf"
            required
            className="mt-1 block w-full text-sm"
          />
        </div>
        <Button type="submit" variant="secondary">
          {current ? t("replace") : t("upload")}
        </Button>
      </div>
    </form>
  );
}
