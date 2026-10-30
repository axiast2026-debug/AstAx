import { cn } from "../cn.js";

/** The web apps serve each company's logo from their own address (ADR 0028). */
export const companyLogoPath = (companyId: string) => `/loghi/${encodeURIComponent(companyId)}`;

const HEIGHT = { list: 24, detail: 40 } as const;

/**
 * The logo of the company of an offer (ADR 0028): 24 px in lists, 40 px in a
 * detail, the company name as its text. A company without a logo gets the
 * neutral placeholder from the same address, never another company's logo.
 * Only next to a real offer or in the back office: never on public pages.
 */
export function CompanyLogo({
  companyId,
  name,
  size = "list",
  className,
}: {
  companyId: string;
  name: string;
  size?: keyof typeof HEIGHT;
  className?: string;
}) {
  const height = HEIGHT[size];
  return (
    // A plain <img>: the file comes from the app itself and is already small.
    <img
      src={companyLogoPath(companyId)}
      alt={name}
      height={height}
      loading="lazy"
      decoding="async"
      className={cn("inline-block w-auto shrink-0 object-contain", className)}
      style={{ height, maxWidth: height * 4 }}
    />
  );
}
