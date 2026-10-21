"use client";

/**
 * The file field of a photo: hidden behind its label (a big button), opens the
 * camera on a phone and sends the form as soon as a file is chosen. No
 * `capture`: the phone offers camera, gallery or a file (a PDF of the registration).
 */
export function AutoSubmitFile({ id }: { id: string }) {
  return (
    <input
      id={id}
      name="file"
      type="file"
      accept="image/jpeg,image/png,image/webp,application/pdf"
      required
      className="sr-only"
      onChange={(event) => event.currentTarget.form?.requestSubmit()}
    />
  );
}
