/**
 * The neutral placeholder of a company without a logo (ADR 0028): a grey
 * square with a shield, never another company's mark.
 */
export const COMPANY_LOGO_PLACEHOLDER = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 40" width="40" height="40"><rect width="40" height="40" rx="8" fill="#EEEAE4"/><path d="M20 9l9 3.5v7c0 5.6-3.8 9.8-9 11.5-5.2-1.7-9-5.9-9-11.5v-7z" fill="none" stroke="#8A8178" stroke-width="2" stroke-linejoin="round"/></svg>`;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const imageHeaders = (contentType: string, cache: string) => ({
  "content-type": contentType,
  "cache-control": cache,
  "x-content-type-options": "nosniff",
  // An SVG opened on its own runs nothing.
  "content-security-policy": "default-src 'none'; style-src 'unsafe-inline'; sandbox",
});

function placeholder(): Response {
  return new Response(COMPANY_LOGO_PLACEHOLDER, {
    status: 200,
    headers: imageHeaders("image/svg+xml", "public, max-age=300"),
  });
}

/**
 * The route `/loghi/:companyId` of the web apps: the logo from the API
 * (`GET /companies/:id/logo`), or the placeholder when the company has none
 * or the API does not answer.
 */
export async function companyLogoResponse(
  apiUrl: string,
  companyId: string,
  fetchImpl: typeof fetch = fetch,
): Promise<Response> {
  if (!UUID.test(companyId)) return placeholder();
  try {
    const upstream = await fetchImpl(`${apiUrl}/companies/${companyId}/logo`, {
      next: { revalidate: 3600 },
    } as RequestInit);
    const type = upstream.headers.get("content-type") ?? "";
    if (!upstream.ok || !/^image\/(svg\+xml|png)$/.test(type)) return placeholder();
    return new Response(await upstream.arrayBuffer(), {
      status: 200,
      headers: imageHeaders(type, "public, max-age=3600"),
    });
  } catch {
    return placeholder();
  }
}
