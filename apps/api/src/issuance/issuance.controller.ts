import { Body, Controller, Get, HttpCode, Inject, Param, Post, Res } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import type { Response } from "express";
import { z } from "zod";
import type { AuthContext } from "../auth/auth-context.js";
import { CurrentAuth, RequirePermission } from "../auth/decorators.js";
import { parseInput } from "../http/validation.js";
import { sendFile } from "../requests/requests.controller.js";
import { ISSUANCE_KINDS, IssuanceService } from "./issuance.service.js";

const uuid = z.uuid();
const kindSchema = z.enum(ISSUANCE_KINDS);
const issueSchema = z.strictObject({ policyNumber: z.string().trim().min(3).max(40) });
const problemSchema = z.strictObject({
  type: z.enum(["DATA_MISMATCH", "CANNOT_ISSUE"]),
  description: z.string().trim().min(5).max(1000),
});

/** EMI-01, EMI-02, EMI-04: «Da emettere» for the winning agency (issuance.manage). */
@ApiTags("issuance")
@ApiBearerAuth()
@Controller()
export class IssuanceController {
  constructor(@Inject(IssuanceService) private readonly issuance: IssuanceService) {}

  @Get("agency/issuance/:requestId")
  @RequirePermission("issuance.manage")
  detail(@CurrentAuth() auth: AuthContext, @Param("requestId") requestId: string) {
    return this.issuance.detail(auth, parseInput(uuid, requestId));
  }

  @Post("agency/issuance/:requestId/documents/:kind")
  @HttpCode(201)
  @RequirePermission("issuance.manage")
  upload(
    @CurrentAuth() auth: AuthContext,
    @Param("requestId") requestId: string,
    @Param("kind") kind: string,
    @Body() body: unknown,
  ) {
    const bytes = body instanceof Buffer ? new Uint8Array(body) : new Uint8Array();
    return this.issuance.upload(
      auth,
      parseInput(uuid, requestId),
      parseInput(kindSchema, kind),
      bytes,
    );
  }

  @Get("agency/issuance/:requestId/documents/:documentId")
  @RequirePermission("issuance.manage")
  async file(
    @CurrentAuth() auth: AuthContext,
    @Param("requestId") requestId: string,
    @Param("documentId") documentId: string,
    @Res() response: Response,
  ) {
    sendFile(
      response,
      await this.issuance.file(
        auth,
        parseInput(uuid, requestId),
        documentId === "receipt" ? "receipt" : parseInput(uuid, documentId),
      ),
    );
  }

  @Post("agency/issuance/:requestId/issue")
  @HttpCode(200)
  @RequirePermission("issuance.manage")
  issue(
    @CurrentAuth() auth: AuthContext,
    @Param("requestId") requestId: string,
    @Body() body: unknown,
  ) {
    return this.issuance.issue(
      auth,
      parseInput(uuid, requestId),
      parseInput(issueSchema, body).policyNumber,
    );
  }

  @Post("agency/issuance/:requestId/problem")
  @HttpCode(201)
  @RequirePermission("issuance.manage")
  problem(
    @CurrentAuth() auth: AuthContext,
    @Param("requestId") requestId: string,
    @Body() body: unknown,
  ) {
    return this.issuance.reportProblem(
      auth,
      parseInput(uuid, requestId),
      parseInput(problemSchema, body),
    );
  }

  @Get("agency/policies")
  @RequirePermission("issuance.manage")
  agencyPolicies(@CurrentAuth() auth: AuthContext) {
    return this.issuance.agencyPolicies(auth);
  }

  /** Spec 02 and 03 «Polizze»: the requester's own policies. */
  @Get("policies")
  @RequirePermission("request.viewOwn")
  policies(@CurrentAuth() auth: AuthContext) {
    return this.issuance.requesterPolicies(auth);
  }
}
