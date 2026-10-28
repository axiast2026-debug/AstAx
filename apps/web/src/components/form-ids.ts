/** The id of a form field from its name: shared by server and client forms. */
export function fieldId(name: string): string {
  return `f-${name.replace(/[^a-zA-Z0-9]/g, "-")}`;
}
