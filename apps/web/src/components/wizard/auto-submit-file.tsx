"use client";

/**
 * The file field of a photo: hidden behind its label (a big button), opens the
 * camera on a phone and sends the form as soon as a file is chosen. No
 * `capture`: the phone offers camera, gallery or a file (a PDF of the registration).
 */
export function AutoSubmitFile({
  id,
  accept = "image/jpeg,image/png,image/webp,application/pdf",
  multiple = false,
}: {
  id: string;
  accept?: string;
  /** Dan, 2026-10-28: front and back, several pages, chosen together. */
  multiple?: boolean;
}) {
  return (
    <input
      id={id}
      name="file"
      type="file"
      accept={accept}
      multiple={multiple}
      required
      className="sr-only"
      onChange={(event) => event.currentTarget.form?.requestSubmit()}
    />
  );
}
