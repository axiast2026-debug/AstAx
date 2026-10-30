"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { api } from "@/lib/auth";
import { tokenOfLink } from "@/lib/customer-link";
import { publicApi } from "@/lib/public-api";

/**
 * Actions of the acceptance (phase 5). Errors come back as codes in
 * `errore`; the API checks every rule again (GAR-04, the fee, the offer).
 */
const uuid = /^[0-9a-f-]{36}$/i;

function idOf(formData: FormData, name: string): string {
  const id = String(formData.get(name) ?? "");
  if (!uuid.test(id)) redirect("/");
  return id;
}

function codesOf(body: unknown): string {
  const problem = (body ?? {}) as { code?: string; errors?: { path: string; issue: string }[] };
  return problem.errors?.length
    ? problem.errors.map((e) => e.issue).join(",")
    : (problem.code ?? "INTERNAL");
}

const quotePage = (requestId: string) => `/preventivi/${requestId}`;
const acceptancePage = (requestId: string) => `/preventivi/${requestId}/accettazione`;

/** PRES-06: the customer has seen the higher fee and confirms. */
export async function confirmAiComparison(formData: FormData): Promise<void> {
  const requestId = idOf(formData, "requestId");
  const { status, body } = await api(`/requests/${requestId}/ai-comparison`, {
    method: "POST",
    body: JSON.stringify({ feeIncreaseAccepted: true }),
  });
  if (status !== 200)
    redirect(`${quotePage(requestId)}?errore=${encodeURIComponent(codesOf(body))}`);
  redirect(`${quotePage(requestId)}?fatto=confronto#offerte`);
}

/** PRES-05: the chosen offer; then the documents and the signature. */
export async function chooseOffer(formData: FormData): Promise<void> {
  const requestId = idOf(formData, "requestId");
  const offerId = idOf(formData, "offerId");
  const { status, body } = await api(`/requests/${requestId}/acceptance`, {
    method: "POST",
    body: JSON.stringify({ offerId, returnPath: acceptancePage(requestId) }),
  });
  if (status !== 200)
    redirect(`${quotePage(requestId)}?errore=${encodeURIComponent(codesOf(body))}`);
  redirect(acceptancePage(requestId));
}

/** The signature at the provider's page (the fake one in development). */
export async function goToSignature(formData: FormData): Promise<void> {
  const requestId = idOf(formData, "requestId");
  if (formData.get("read") !== "on")
    redirect(`${acceptancePage(requestId)}?errore=DOCUMENTS_NOT_READ`);
  const { body } = await api<{ acceptance: { signingUrl: string | null } | null }>(
    `/requests/${requestId}/acceptance`,
  );
  const url = body.acceptance?.signingUrl;
  if (!url) redirect(acceptancePage(requestId));
  redirect(url);
}

/** PAG-01: to the provider's payment page. */
export async function payAcceptance(formData: FormData): Promise<void> {
  const requestId = idOf(formData, "requestId");
  const { status, body } = await api<{ redirectUrl: string }>(
    `/requests/${requestId}/acceptance/payment`,
    { method: "POST", body: JSON.stringify({ returnPath: acceptancePage(requestId) }) },
  );
  if (status !== 200) {
    redirect(`${acceptancePage(requestId)}?errore=${encodeURIComponent(codesOf(body))}`);
  }
  redirect(body.redirectUrl);
}

/** EMI-04: the customer confirms the second offer (or the new price): sign, then pay the difference. */
export async function confirmNextOffer(formData: FormData): Promise<void> {
  const requestId = idOf(formData, "requestId");
  const { status, body } = await api(`/requests/${requestId}/next-offer/confirm`, {
    method: "POST",
    body: JSON.stringify({ returnPath: acceptancePage(requestId) }),
  });
  if (status !== 200)
    redirect(`${quotePage(requestId)}?errore=${encodeURIComponent(codesOf(body))}`);
  redirect(acceptancePage(requestId));
}

/** EMI-04: the customer prefers the full refund (approved by the back office, PAG-05). */
export async function refuseNextOffer(formData: FormData): Promise<void> {
  const requestId = idOf(formData, "requestId");
  const { status, body } = await api(`/requests/${requestId}/next-offer/refuse`, {
    method: "POST",
    body: "{}",
  });
  if (status !== 200)
    redirect(`${quotePage(requestId)}?errore=${encodeURIComponent(codesOf(body))}`);
  revalidatePath(quotePage(requestId));
  redirect(`${quotePage(requestId)}?fatto=rimborso`);
}

/** «Invia al cliente» (decision 26): the broker sends the chosen offers. */
/** ADR 0027: the intermediary chooses the offer and goes to pay it. */
export async function purchaseOffer(formData: FormData): Promise<void> {
  const requestId = idOf(formData, "requestId");
  const offerId = idOf(formData, "offerId");
  const page = `/richieste/${requestId}`;
  const { status, body } = await api<{ redirectUrl: string }>(`/requests/${requestId}/purchase`, {
    method: "POST",
    body: JSON.stringify({ offerId, returnPath: page }),
  });
  if (status !== 200) redirect(`${page}?errore=${encodeURIComponent(codesOf(body))}#offerte`);
  redirect(body.redirectUrl);
}

/** ADR 0027: the customer's email or phone, then the link to sign. */
export async function sendForSignature(formData: FormData): Promise<void> {
  const requestId = idOf(formData, "requestId");
  const page = `/richieste/${requestId}`;
  const email = String(formData.get("email") ?? "").trim();
  const phone = String(formData.get("phone") ?? "").trim();
  if (!email && !phone) redirect(`${page}?errore=NO_CONTACTS#offerte`);
  const { status, body } = await api(`/requests/${requestId}/customer-link`, {
    method: "POST",
    body: JSON.stringify({ ...(email ? { email } : {}), ...(phone ? { phone } : {}) }),
  });
  if (status !== 200) redirect(`${page}?errore=${encodeURIComponent(codesOf(body))}#offerte`);
  revalidatePath(page);
  redirect(`${page}#offerte`);
}

// ---------------------------------------------------------------- the fake providers' pages

const ref = (formData: FormData) => {
  const value = String(formData.get("ref") ?? "");
  if (!/^[a-z]+-[0-9a-f-]{36,80}$/.test(value)) redirect("/");
  return value;
};

/**
 * Where the fake provider's page sends the customer back. The link's return
 * address carries its id only: the token is in this browser's cookie (a real
 * provider redirects the browser to `/offerta/ritorno/{id}`, which does the same).
 */
async function backFromProvider(returnUrl: string): Promise<string> {
  const path = new URL(returnUrl).pathname;
  const link = /^\/offerta\/ritorno\/([0-9a-f-]{36})$/.exec(path);
  if (!link) return path;
  const token = await tokenOfLink(link[1] ?? "");
  return token ? `/offerta/${token}` : "/";
}

/** Proposal A: the fake signing page; the code is 123456 in development. */
export async function fakeSign(formData: FormData): Promise<void> {
  const r = ref(formData);
  const { status, body } = await publicApi<{ returnUrl: string }>(
    `/fake-providers/signature/${r}/sign`,
    { method: "POST", body: JSON.stringify({ code: String(formData.get("code") ?? "") }) },
  );
  if (status !== 200) redirect(`/firma-di-prova/${r}?errore=${encodeURIComponent(codesOf(body))}`);
  redirect(await backFromProvider(body.returnUrl));
}

/** Proposal B: the fake payment page (a card ending with 0002 is refused). */
export async function fakePay(formData: FormData): Promise<void> {
  const r = ref(formData);
  const method = formData.get("method") === "INSTANT_TRANSFER" ? "INSTANT_TRANSFER" : "CARD";
  const { status, body } = await publicApi<{ returnUrl: string; status: string }>(
    `/fake-providers/payments/${r}/pay`,
    {
      method: "POST",
      body: JSON.stringify(
        method === "CARD"
          ? { method, cardNumber: String(formData.get("cardNumber") ?? "") }
          : { method },
      ),
    },
  );
  if (status !== 200)
    redirect(`/pagamento-di-prova/${r}?errore=${encodeURIComponent(codesOf(body))}`);
  redirect(`${await backFromProvider(body.returnUrl)}?esito=${body.status.toLowerCase()}`);
}
