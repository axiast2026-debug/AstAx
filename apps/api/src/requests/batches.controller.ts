import { Controller, Get, Headers, Inject, Post, Req, Res } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import type { Request, Response } from "express";
import type { AuthContext } from "../auth/auth-context.js";
import { CurrentAuth, RequirePermission } from "../auth/decorators.js";
import { ProblemError } from "../http/problem.js";
import { BatchesService } from "./batches.service.js";
import { sendFile } from "./requests.controller.js";

/** The broker's lots from an Excel file (ADR 0014, docs/piano-broker.md C-E). */
@ApiTags("broker")
@ApiBearerAuth()
@Controller("broker/batches")
export class BatchesController {
  constructor(@Inject(BatchesService) private readonly batches: BatchesService) {}

  @Get()
  @RequirePermission("request.bulkUpload")
  list(@CurrentAuth() auth: AuthContext) {
    return this.batches.list(auth);
  }

  @Get("template")
  @RequirePermission("request.bulkUpload")
  async template(@CurrentAuth() auth: AuthContext, @Res() response: Response) {
    sendFile(response, await this.batches.template(auth));
  }

  /** The `.xlsx` as the body; its name, for the list of lots, in `x-file-name`. */
  @Post()
  @RequirePermission("request.bulkUpload")
  upload(
    @CurrentAuth() auth: AuthContext,
    @Req() request: Request,
    @Headers("x-file-name") fileName: string | undefined,
  ) {
    const body = request.body as unknown;
    if (!(body instanceof Buffer) || body.byteLength === 0) {
      throw new ProblemError("VALIDATION_FAILED", undefined, [
        { path: "file", issue: "FILE_REQUIRED" },
      ]);
    }
    const name = decodeURIComponent(fileName ?? "lotto.xlsx").replace(/[^\w .()-]/g, "_");
    return this.batches.upload(auth, name || "lotto.xlsx", new Uint8Array(body));
  }
}
