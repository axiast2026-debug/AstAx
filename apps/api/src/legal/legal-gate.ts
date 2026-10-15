import { Inject, Injectable } from "@nestjs/common";
import type { AuthContext } from "../auth/auth-context.js";
import { LegalService } from "./legal.service.js";

/** Used by the AuthGuard: true while the user has legal texts in force to accept (LEG-02). */
@Injectable()
export class LegalGate {
  constructor(@Inject(LegalService) private readonly legal: LegalService) {}

  async hasPending(auth: AuthContext): Promise<boolean> {
    return (await this.legal.pending(auth)).length > 0;
  }
}
