import { WizardPage } from "@/components/wizard/wizard-page";
import { PRIVATE_STEPS } from "@/lib/requests";

/** The private customer's wizard, one step per page (spec 03 «Nuovo preventivo»). */
export default function PrivateWizardPage(props: {
  params: Promise<{ id: string; step: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  return <WizardPage base="/preventivi" steps={PRIVATE_STEPS} {...props} />;
}
