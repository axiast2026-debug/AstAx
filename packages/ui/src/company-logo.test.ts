import { describe, expect, it } from "vitest";
import { CompanyLogo, companyLogoPath } from "./components/company-logo.js";
import { COMPANY_LOGO_PLACEHOLDER, companyLogoResponse } from "./server/company-logo.js";

const ID = "0190f3a4-1b2c-7d3e-8f40-123456789abc";
const OTHER = "0190f3a4-1b2c-7d3e-8f40-cba987654321";

describe("ADR 0028: the logo of an offer's company", () => {
  it("an offer shows the logo of its own company only, with the name as text", () => {
    const element = CompanyLogo({ companyId: ID, name: "Allianz" });
    expect(element.props.src).toBe(companyLogoPath(ID));
    expect(element.props.src).not.toBe(companyLogoPath(OTHER));
    expect(element.props.alt).toBe("Allianz");
    expect(element.props.height).toBe(24);
    expect(CompanyLogo({ companyId: ID, name: "Allianz", size: "detail" }).props.height).toBe(40);
  });

  it("the logo comes from the API when the company has one", async () => {
    const svg = '<svg xmlns="http://www.w3.org/2000/svg"/>';
    const fetchImpl = (async (url: string) => {
      expect(url).toBe(`http://api/companies/${ID}/logo`);
      return new Response(svg, { headers: { "content-type": "image/svg+xml" } });
    }) as typeof fetch;
    const response = await companyLogoResponse("http://api", ID, fetchImpl);
    expect(await response.text()).toBe(svg);
  });

  it("the placeholder when logoKey is null (the API answers 404), on errors and on a bad id", async () => {
    const notFound = (async () => new Response("", { status: 404 })) as typeof fetch;
    const failing = (async () => {
      throw new Error("down");
    }) as typeof fetch;
    for (const response of [
      await companyLogoResponse("http://api", ID, notFound),
      await companyLogoResponse("http://api", ID, failing),
      await companyLogoResponse("http://api", "../etc", notFound),
    ]) {
      expect(response.status).toBe(200);
      expect(response.headers.get("content-type")).toBe("image/svg+xml");
      expect(await response.text()).toBe(COMPANY_LOGO_PLACEHOLDER);
    }
  });
});
