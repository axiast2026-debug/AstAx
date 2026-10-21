import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  Inject,
  Param,
  Post,
  Put,
  Query,
  Req,
  Res,
} from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import type { Request, Response } from "express";
import { z } from "zod";
import type { DocumentKind } from "@astax/db";
import { QUOTE_DRAFT_SECTIONS, type QuoteDraftSection } from "@astax/shared/domain";
import type { AuthContext } from "../auth/auth-context.js";
import { CurrentAuth, RequirePermission } from "../auth/decorators.js";
import { ProblemError } from "../http/problem.js";
import { parseInput } from "../http/validation.js";
import { ConsentService } from "./consent.service.js";
import { ReferenceService } from "./reference.service.js";
import { RequestsService } from "./requests.service.js";

const uuid = z.uuid();
const createSchema = z.strictObject({ customerId: z.uuid().optional() });
const specialUsesSchema = z.strictObject({
  specialUses: z.array(z.string().regex(/^[A-Z_]{1,40}$/)).max(20),
});
const plateSchema = z.strictObject({
  plate: z.string().min(2).max(12),
  vehicleType: z.enum(["CAR", "MOTORCYCLE", "MOPED"]).optional(),
});
/** A draft section travels as { value }: some sections are a plain string (SAME_AS_POLICY_HOLDER). */
const sectionSchema = z.strictObject({ value: z.unknown() });
const codeSchema = z.strictObject({ code: z.string().regex(/^\d{6}$/) });
const uploadedConsentSchema = z.strictObject({ documentId: z.uuid() });
const listSchema = z.object({
  status: z
    .string()
    .regex(/^[A-Z_]+$/)
    .optional(),
});
/** The plate filter travels in the body, never in a URL (rule 8). */
const searchSchema = z.strictObject({
  status: z
    .string()
    .regex(/^[A-Z_]+$/)
    .optional(),
  q: z.string().max(20).optional(),
});

function idOf(value: string): string {
  return parseInput(uuid, value);
}

/** Requests of private users and brokers (fase 2; spec 02 and 03). */
@ApiTags("requests")
@ApiBearerAuth()
@Controller()
export class RequestsController {
  constructor(
    @Inject(RequestsService) private readonly requests: RequestsService,
    @Inject(ConsentService) private readonly consents: ConsentService,
    @Inject(ReferenceService) private readonly reference: ReferenceService,
  ) {}

  @Get("reference/request-options")
  @RequirePermission("request.create")
  options(@CurrentAuth() auth: AuthContext) {
    return this.reference.requestOptions(auth);
  }

  @Get("reference/municipalities")
  @RequirePermission("profile.view")
  municipalities(
    @CurrentAuth() auth: AuthContext,
    @Query("q") q: string | undefined,
    @Query("cadastral") cadastral: string | undefined,
  ) {
    return this.reference.searchMunicipalities(auth, q ?? "", cadastral);
  }

  @Post("vehicle-data/lookup")
  @HttpCode(200)
  @RequirePermission("request.create")
  lookup(@Body() body: unknown) {
    return this.requests.lookupPlate(parseInput(plateSchema, body));
  }

  @Get("requests")
  @RequirePermission("request.viewOwn")
  list(@CurrentAuth() auth: AuthContext, @Query() query: unknown) {
    return this.requests.list(auth, parseInput(listSchema, query));
  }

  @Post("requests/search")
  @HttpCode(200)
  @RequirePermission("request.viewOwn")
  search(@CurrentAuth() auth: AuthContext, @Body() body: unknown) {
    return this.requests.list(auth, parseInput(searchSchema, body));
  }

  @Post("requests")
  @HttpCode(201)
  @RequirePermission("request.create")
  create(@CurrentAuth() auth: AuthContext, @Body() body: unknown) {
    return this.requests.create(auth, parseInput(createSchema, body ?? {}));
  }

  @Get("requests/:id")
  @RequirePermission("request.viewOwn")
  detail(@CurrentAuth() auth: AuthContext, @Param("id") id: string) {
    return this.requests.detail(auth, idOf(id));
  }

  @Put("requests/:id/draft/special-uses")
  @RequirePermission("request.create")
  specialUses(@CurrentAuth() auth: AuthContext, @Param("id") id: string, @Body() body: unknown) {
    return this.requests.saveSpecialUses(
      auth,
      idOf(id),
      parseInput(specialUsesSchema, body).specialUses,
    );
  }

  @Put("requests/:id/draft/:section")
  @RequirePermission("request.create")
  saveSection(
    @CurrentAuth() auth: AuthContext,
    @Param("id") id: string,
    @Param("section") section: string,
    @Body() body: unknown,
  ) {
    // ADR 0013: «intake», the essential data of the private customer, is a section too.
    if (section !== "intake" && !(QUOTE_DRAFT_SECTIONS as readonly string[]).includes(section))
      throw new ProblemError("NOT_FOUND");
    return this.requests.saveSection(
      auth,
      idOf(id),
      section as QuoteDraftSection,
      parseInput(sectionSchema, body).value,
    );
  }

  /**
   * Upload of one file: the body is the file itself (image or PDF), the kind
   * and the file name go in the query string and a header.
   */
  @Post("requests/:id/documents")
  @HttpCode(201)
  @RequirePermission("request.create")
  upload(
    @CurrentAuth() auth: AuthContext,
    @Param("id") id: string,
    @Query("kind") kind: string | undefined,
    @Query("driverIndex") driverIndex: string | undefined,
    @Headers("content-type") contentType: string | undefined,
    @Headers("x-file-name") fileName: string | undefined,
    @Req() request: Request,
  ) {
    const body = request.body as unknown;
    if (!(body instanceof Buffer)) {
      throw new ProblemError("VALIDATION_FAILED", undefined, [
        { path: "body", issue: "file_required" },
      ]);
    }
    const index = driverIndex === undefined ? null : Number(driverIndex);
    if (index !== null && (!Number.isInteger(index) || index < 0 || index > 9)) {
      throw new ProblemError("VALIDATION_FAILED", undefined, [
        { path: "driverIndex", issue: "invalid" },
      ]);
    }
    const name = decodeFileName(fileName);
    return this.requests.upload(auth, idOf(id), {
      kind: (kind ?? "") as DocumentKind,
      driverIndex: index,
      fileName: name,
      contentType: (contentType ?? "").split(";")[0]?.trim() ?? "",
      body: new Uint8Array(body),
    });
  }

  @Get("requests/:id/documents/:documentId/file")
  @RequirePermission("request.viewOwn")
  async file(
    @CurrentAuth() auth: AuthContext,
    @Param("id") id: string,
    @Param("documentId") documentId: string,
    @Res() response: Response,
  ): Promise<void> {
    const file = await this.requests.documentFile(auth, idOf(id), idOf(documentId));
    sendFile(response, file);
  }

  @Post("requests/:id/submit")
  @HttpCode(200)
  @RequirePermission("request.create")
  submit(@CurrentAuth() auth: AuthContext, @Param("id") id: string) {
    return this.requests.submit(auth, idOf(id));
  }

  @Post("requests/:id/cancel")
  @HttpCode(200)
  @RequirePermission("request.cancel")
  cancel(@CurrentAuth() auth: AuthContext, @Param("id") id: string) {
    return this.requests.cancel(auth, idOf(id));
  }

  // -------------------------------------------------------------- consent (LEG-04)

  @Get("requests/:id/consent")
  @RequirePermission("request.create")
  consent(@CurrentAuth() auth: AuthContext, @Param("id") id: string) {
    return this.consents.status(auth, idOf(id));
  }

  @Post("requests/:id/consent/code")
  @HttpCode(204)
  @RequirePermission("request.create")
  async sendCode(@CurrentAuth() auth: AuthContext, @Param("id") id: string): Promise<void> {
    await this.consents.sendPrivateCode(auth, idOf(id));
  }

  @Post("requests/:id/consent/confirm")
  @HttpCode(200)
  @RequirePermission("request.create")
  confirm(@CurrentAuth() auth: AuthContext, @Param("id") id: string, @Body() body: unknown) {
    return this.consents.confirmPrivate(auth, idOf(id), parseInput(codeSchema, body).code);
  }

  @Post("requests/:id/consent/link")
  @HttpCode(200)
  @RequirePermission("customerLink.send")
  sendLink(@CurrentAuth() auth: AuthContext, @Param("id") id: string) {
    return this.consents.sendLink(auth, idOf(id));
  }

  @Get("me/consents")
  @RequirePermission("consent.revoke")
  ownConsents(@CurrentAuth() auth: AuthContext) {
    return this.consents.listOwn(auth);
  }

  @Post("consents/:id/revoke")
  @HttpCode(200)
  @RequirePermission("consent.revoke")
  revokeConsent(@CurrentAuth() auth: AuthContext, @Param("id") id: string) {
    return this.consents.revoke(auth, idOf(id));
  }

  @Post("requests/:id/consent/uploaded")
  @HttpCode(200)
  @RequirePermission("brokerCustomer.manage")
  uploaded(@CurrentAuth() auth: AuthContext, @Param("id") id: string, @Body() body: unknown) {
    return this.consents.uploadedByBroker(
      auth,
      idOf(id),
      parseInput(uploadedConsentSchema, body).documentId,
    );
  }
}

/** File name sent URL-encoded in the X-File-Name header (headers are ASCII only). */
function decodeFileName(header: string | undefined): string {
  try {
    return decodeURIComponent(header ?? "").slice(0, 200) || "documento";
  } catch {
    throw new ProblemError("VALIDATION_FAILED", undefined, [
      { path: "x-file-name", issue: "invalid" },
    ]);
  }
}

export function sendFile(
  response: Response,
  file: { body: Uint8Array; mime: string; fileName: string },
): void {
  response.setHeader("content-type", file.mime);
  response.setHeader("cache-control", "private, no-store");
  response.setHeader("x-content-type-options", "nosniff");
  response.setHeader(
    "content-disposition",
    `inline; filename*=UTF-8''${encodeURIComponent(file.fileName)}`,
  );
  response.end(Buffer.from(file.body));
}
