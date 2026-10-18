import { Controller, Inject, Post, Req } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import type { Request } from "express";
import type { AuthContext } from "../auth/auth-context.js";
import { CurrentAuth, RequirePermission } from "../auth/decorators.js";
import { ProblemError } from "../http/problem.js";
import { BulkUploadService } from "./bulk-upload.service.js";

/** The broker's bulk upload: the CSV, or a ZIP with the CSV and the documents, as the body. */
@ApiTags("broker")
@ApiBearerAuth()
@Controller("broker/bulk-uploads")
export class BulkUploadController {
  constructor(@Inject(BulkUploadService) private readonly bulk: BulkUploadService) {}

  @Post()
  @RequirePermission("request.bulkUpload")
  upload(@CurrentAuth() auth: AuthContext, @Req() request: Request) {
    const body = request.body as unknown;
    if (!(body instanceof Buffer) || body.byteLength === 0) {
      throw new ProblemError("VALIDATION_FAILED", undefined, [
        { path: "file", issue: "FILE_REQUIRED" },
      ]);
    }
    return this.bulk.run(auth, new Uint8Array(body));
  }
}
