import { WizardPage } from "@/components/wizard/wizard-page";
import { BROKER_STEPS } from "@/lib/requests";

/** The broker's wizard after the customer is chosen (spec 02 «Nuova richiesta»). */
export default function BrokerWizardPage(props: {
  params: Promise<{ id: string; step: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  return <WizardPage base="/richieste" steps={BROKER_STEPS} {...props} />;
}
