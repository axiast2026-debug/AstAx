import { ObjectNotFoundError, type ObjectStoragePort } from "@astax/adapters/storage";
import { SYSTEM_CONTEXT, withContext, type DbClient } from "@astax/db";
import { Controller, Get, Headers, Inject, Param, Put, Req, Res } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import type { Request, Response } from "express";
import { z } from "zod";
import { actorOf, AuditService } from "../audit/audit.service.js";
import type { AuthContext } from "../auth/auth-context.js";
import { CurrentAuth, RequirePermission } from "../auth/decorators.js";
import { ProblemError } from "../http/problem.js";
import { Public } from "../http/public.decorator.js";
import { parseInput } from "../http/validation.js";
import { DB, OBJECT_STORAGE } from "../infra/tokens.js";

const uuid = z.uuid();

/** A logo is small: the files of seed/loghi are under 50 KB. */
export const MAX_LOGO_BYTES = 512 * 1024;

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

/** The S3 key of a company's logo: public, not personal data (ADR 0028). */
const logoKeyOf = (companyId: string, ext: string) => `public/companies/${companyId}.${ext}`;

/**
 * Checks an uploaded logo: a PNG by its signature, or an SVG with no script,
 * event handler or external reference (it is shown as an image, but a file
 * opened directly must not run anything).
 */
export function checkLogo(body: Uint8Array, contentType: string): "png" | "svg" | null {
  if (body.length === 0 || body.length > MAX_LOGO_BYTES) return null;
  if (contentType === "image/png") {
    return PNG_SIGNATURE.every((b, i) => body[i] === b) ? "png" : null;
  }
  if (contentType === "image/svg+xml") {
    const text = new TextDecoder("utf-8", { fatal: false }).decode(body);
    if (!/<svg[\s>]/i.test(text)) return null;
    if (
      /<script|<foreignObject|\son[a-z]+\s*=|javascript:|(?:href|src)\s*=\s*["']\s*(?:https?:|\/\/)/i.test(
        text,
      )
    ) {
      return null;
    }
    return "svg";
  }
  return null;
}

const mimeOf = (key: string) => (key.endsWith(".svg") ? "image/svg+xml" : "image/png");

/**
 * The companies' logos (ADR 0028). Anyone may read a logo: it is a public
 * mark, not personal data; the web apps serve it from their own address.
 * The back office lists the companies and uploads or replaces a logo; each
 * change is in the audit log (rule 4).
 */
@ApiTags("companies")
@Controller()
export class CompaniesController {
  constructor(
    @Inject(DB) private readonly db: DbClient,
    @Inject(OBJECT_STORAGE) private readonly storage: ObjectStoragePort,
    @Inject(AuditService) private readonly audit: AuditService,
  ) {}

  @Get("companies/:id/logo")
  @Public()
  async logo(@Param("id") id: string, @Res() response: Response) {
    const companyId = parseInput(uuid, id);
    const company = await withContext(this.db, SYSTEM_CONTEXT, (tx) =>
      tx.insuranceCompany.findUnique({ where: { id: companyId }, select: { logoKey: true } }),
    );
    if (!company?.logoKey) throw new ProblemError("NOT_FOUND");
    let body: Uint8Array;
    try {
      body = await this.storage.get(company.logoKey);
    } catch (error) {
      if (error instanceof ObjectNotFoundError) throw new ProblemError("NOT_FOUND");
      throw error;
    }
    response.setHeader("content-type", mimeOf(company.logoKey));
    response.setHeader("cache-control", "public, max-age=3600");
    response.setHeader("x-content-type-options", "nosniff");
    // An SVG opened on its own runs nothing.
    response.setHeader(
      "content-security-policy",
      "default-src 'none'; style-src 'unsafe-inline'; sandbox",
    );
    response.end(Buffer.from(body));
  }

  @Get("admin/companies")
  @ApiBearerAuth()
  @RequirePermission("admin.settings.manage")
  list(@CurrentAuth() auth: AuthContext) {
    return withContext(this.db, auth.db, async (tx) => {
      const companies = await tx.insuranceCompany.findMany({ orderBy: { name: "asc" } });
      return companies.map((c) => ({
        companyId: c.id,
        company: c.name,
        group: c.group,
        website: c.website,
        ivassCode: c.ivassCode,
        hasLogo: c.logoKey !== null,
        active: c.active,
      }));
    });
  }

  /** The PNG or SVG is the body. */
  @Put("admin/companies/:id/logo")
  @ApiBearerAuth()
  @RequirePermission("admin.settings.manage")
  setLogo(
    @CurrentAuth() auth: AuthContext,
    @Param("id") id: string,
    @Headers("content-type") contentType: string | undefined,
    @Req() request: Request,
  ) {
    const companyId = parseInput(uuid, id);
    const body = request.body as unknown;
    const file = body instanceof Buffer ? new Uint8Array(body) : new Uint8Array();
    const ext = checkLogo(file, (contentType ?? "").split(";")[0]?.trim() ?? "");
    if (!ext) {
      throw new ProblemError("VALIDATION_FAILED", undefined, [
        { path: "file", issue: "LOGO_PNG_OR_SVG" },
      ]);
    }
    return withContext(this.db, auth.db, async (tx) => {
      const company = await tx.insuranceCompany.findUnique({ where: { id: companyId } });
      if (!company) throw new ProblemError("NOT_FOUND");
      const logoKey = logoKeyOf(companyId, ext);
      await this.storage.put({ key: logoKey, body: file, contentType: mimeOf(logoKey) });
      await tx.insuranceCompany.update({ where: { id: companyId }, data: { logoKey } });
      await this.audit.inTransaction(tx, actorOf(auth), {
        action: "COMPANY_LOGO_SET",
        targetType: "InsuranceCompany",
        targetId: companyId,
        before: { logoKey: company.logoKey },
        after: { logoKey },
      });
      return { companyId, hasLogo: true };
    });
  }
}
