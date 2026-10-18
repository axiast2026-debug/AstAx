import { FakePaymentsProvider } from "@astax/adapters/payments";
import { FakeSignatureProvider } from "@astax/adapters/signature";
import type { PaymentsPort } from "@astax/adapters/payments";
import type { SignaturePort } from "@astax/adapters/signature";
import type { Logger } from "@astax/shared/logging";
import { errorForLog } from "@astax/shared/logging";
import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  Inject,
  Param,
  Post,
  Req,
  Res,
} from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import type { Request, Response } from "express";
import { z } from "zod";
import type { AuthContext } from "../auth/auth-context.js";
import { CurrentAuth, RequirePermission } from "../auth/decorators.js";
import type { ApiConfig } from "../config/config.js";
import { ProblemError } from "../http/problem.js";
import { Public } from "../http/public.decorator.js";
import { InvoicingService } from "../invoicing/invoicing.service.js";
import { SkipRateLimit } from "../security/rate-limit.guard.js";
import { parseInput } from "../http/validation.js";
import { CONFIG, LOGGER, PAYMENTS, SIGNATURE } from "../infra/tokens.js";
import { sendFile } from "../requests/requests.controller.js";
import { AcceptanceEventsService } from "./acceptance-events.service.js";
import { AcceptanceService } from "./acceptance.service.js";
import { CustomerLinksService } from "./customer-links.service.js";

const uuid = z.uuid();
/** A path of the web app the provider sends the customer back to: never another site. */
const returnPath = z
  .string()
  .regex(/^\/[A-Za-z0-9/_-]*$/)
  .max(200);
const acceptSchema = z.strictObject({ offerId: uuid, returnPath });
const paySchema = z.strictObject({ returnPath });
const aiConfirmSchema = z.strictObject({ feeIncreaseAccepted: z.literal(true) });
const sendLinkSchema = z.strictObject({ offerIds: z.array(uuid).min(1).max(20) });
const PROOF_HEADER = "x-astax-link-proof";

function clientOf(request: Request) {
  return {
    ip: request.ip ?? null,
    userAgent: request.headers["user-agent"]?.slice(0, 300) ?? null,
  };
}

function proofOf(request: Request): string | undefined {
  const value = request.headers[PROOF_HEADER];
  return typeof value === "string" && value.length <= 100 ? value : undefined;
}

/** Phase 5: the requester's acceptance (processes 3 and 4). */
@ApiTags("acceptance")
@ApiBearerAuth()
@Controller("requests/:id")
export class AcceptanceController {
  constructor(
    @Inject(AcceptanceService) private readonly acceptance: AcceptanceService,
    @Inject(CustomerLinksService) private readonly links: CustomerLinksService,
    @Inject(CONFIG) private readonly config: ApiConfig,
  ) {}

  private url(path: string) {
    return `${this.config.WEB_URL}${path}`;
  }

  @Get("presentation")
  @RequirePermission("offers.viewPresented")
  presentation(@CurrentAuth() auth: AuthContext, @Param("id") id: string) {
    return this.acceptance.presentation(auth, parseInput(uuid, id));
  }

  @Post("ai-comparison")
  @HttpCode(200)
  @RequirePermission("aiComparison.use")
  aiComparison(@CurrentAuth() auth: AuthContext, @Param("id") id: string, @Body() body: unknown) {
    // PRES-06: the customer has seen the fee going up and confirms it.
    parseInput(aiConfirmSchema, body);
    return this.acceptance.aiComparison(auth, parseInput(uuid, id));
  }

  @Get("acceptance")
  @RequirePermission("offers.viewPresented")
  current(@CurrentAuth() auth: AuthContext, @Param("id") id: string) {
    return this.acceptance.current(auth, parseInput(uuid, id));
  }

  @Post("acceptance")
  @HttpCode(200)
  @RequirePermission("offer.accept")
  accept(@CurrentAuth() auth: AuthContext, @Param("id") id: string, @Body() body: unknown) {
    const input = parseInput(acceptSchema, body);
    return this.acceptance.acceptAsPrivate(
      auth,
      parseInput(uuid, id),
      input.offerId,
      this.url(input.returnPath),
    );
  }

  @Post("acceptance/payment")
  @HttpCode(200)
  @RequirePermission("offer.accept")
  pay(@CurrentAuth() auth: AuthContext, @Param("id") id: string, @Body() body: unknown) {
    return this.acceptance.payAsRequester(
      auth,
      parseInput(uuid, id),
      this.url(parseInput(paySchema, body).returnPath),
    );
  }

  /** «Invia al cliente» (decision 26): the broker sends one or more offers. */
  @Post("customer-link")
  @HttpCode(200)
  @RequirePermission("customerLink.send")
  sendLink(@CurrentAuth() auth: AuthContext, @Param("id") id: string, @Body() body: unknown) {
    return this.links.send(auth, parseInput(uuid, id), parseInput(sendLinkSchema, body).offerIds);
  }

  @Get("customer-link")
  @RequirePermission("customerLink.send")
  link(@CurrentAuth() auth: AuthContext, @Param("id") id: string) {
    return this.links.ofRequest(auth, parseInput(uuid, id));
  }

  @Get("offers/:offerId/quote")
  @RequirePermission("offers.viewPresented")
  async quote(
    @CurrentAuth() auth: AuthContext,
    @Param("id") id: string,
    @Param("offerId") offerId: string,
    @Res() response: Response,
  ) {
    sendFile(
      response,
      await this.acceptance.quoteFile(auth, parseInput(uuid, id), parseInput(uuid, offerId)),
    );
  }

  @Get("acceptance/documents/:documentId")
  @RequirePermission("offers.viewPresented")
  async document(
    @CurrentAuth() auth: AuthContext,
    @Param("id") id: string,
    @Param("documentId") documentId: string,
    @Res() response: Response,
  ) {
    sendFile(
      response,
      await this.acceptance.documentFile(auth, parseInput(uuid, id), parseInput(uuid, documentId)),
    );
  }
}

/**
 * The broker's customer on the link (decision 26): no account; the token in
 * the path and, after the code, the proof in a header (BROKER_CLIENT_LINK).
 */
@ApiTags("customer-links")
@Controller("customer-links/:token")
export class CustomerLinksController {
  constructor(@Inject(CustomerLinksService) private readonly links: CustomerLinksService) {}

  @Get()
  @Public()
  summary(@Param("token") token: string, @Req() request: Request) {
    return this.links.summary(token, proofOf(request));
  }

  @Post("code")
  @HttpCode(204)
  @Public()
  async code(@Param("token") token: string): Promise<void> {
    await this.links.sendCode(token);
  }

  @Post("confirm")
  @HttpCode(200)
  @Public()
  confirm(@Param("token") token: string, @Body() body: unknown, @Req() request: Request) {
    return this.links.confirmCode(token, parseInput(codeSchema, body).code, clientOf(request));
  }

  @Post("acceptance")
  @HttpCode(200)
  @Public()
  accept(@Param("token") token: string, @Body() body: unknown, @Req() request: Request) {
    const input = parseInput(z.strictObject({ offerId: uuid }), body);
    return this.links.accept(token, proofOf(request), input.offerId, clientOf(request));
  }

  @Post("acceptance/payment")
  @HttpCode(200)
  @Public()
  pay(@Param("token") token: string, @Req() request: Request) {
    return this.links.pay(token, proofOf(request), clientOf(request));
  }

  @Get("acceptance/documents/:documentId")
  @Public()
  async document(
    @Param("token") token: string,
    @Param("documentId") documentId: string,
    @Req() request: Request,
    @Res() response: Response,
  ) {
    sendFile(
      response,
      await this.links.file(
        token,
        proofOf(request),
        { documentId: parseInput(uuid, documentId) },
        clientOf(request),
      ),
    );
  }

  @Get("offers/:offerId/quote")
  @Public()
  async quote(
    @Param("token") token: string,
    @Param("offerId") offerId: string,
    @Req() request: Request,
    @Res() response: Response,
  ) {
    sendFile(
      response,
      await this.links.file(
        token,
        proofOf(request),
        { offerId: parseInput(uuid, offerId) },
        clientOf(request),
      ),
    );
  }
}

/** The providers' webhooks: no account, the provider's signature is the proof. */
@ApiTags("webhooks")
@SkipRateLimit()
@Controller("webhooks")
export class WebhooksController {
  constructor(
    @Inject(AcceptanceEventsService) private readonly events: AcceptanceEventsService,
    @Inject(InvoicingService) private readonly invoicing: InvoicingService,
  ) {}

  /** Phase 8: the SDI receipts (delivered, rejected) from the e-invoicing provider. */
  @Post("sdi")
  @HttpCode(204)
  @Public()
  async sdi(@Headers() headers: Record<string, string>, @Body() body: unknown): Promise<void> {
    await this.invoicing.applySdiWebhook(headers, typeof body === "string" ? body : "");
  }

  @Post("signature")
  @HttpCode(204)
  @Public()
  async signature(
    @Headers() headers: Record<string, string>,
    @Body() body: unknown,
  ): Promise<void> {
    await this.events.signatureWebhook(headers, typeof body === "string" ? body : "");
  }

  @Post("payments")
  @HttpCode(204)
  @Public()
  async payments(@Headers() headers: Record<string, string>, @Body() body: unknown): Promise<void> {
    await this.events.paymentWebhook(headers, typeof body === "string" ? body : "");
  }
}

const codeSchema = z.strictObject({ code: z.string().regex(/^\d{6}$/) });
const payFakeSchema = z.union([
  z.strictObject({ method: z.literal("CARD"), cardNumber: z.string().regex(/^[\d ]{12,23}$/) }),
  z.strictObject({ method: z.literal("INSTANT_TRANSFER") }),
]);

/**
 * The pages of the fake providers (rule 9, proposals A, B and I of phase 5):
 * what the provider's own site would do, only while the providers are the
 * fakes and never in production. Each outcome goes through the same webhook
 * handling as a real one, signed and checked.
 */
@ApiTags("fake-providers")
@SkipRateLimit()
@Controller("fake-providers")
export class FakeProvidersController {
  constructor(
    @Inject(SIGNATURE) private readonly signature: SignaturePort,
    @Inject(PAYMENTS) private readonly payments: PaymentsPort,
    @Inject(CONFIG) private readonly config: ApiConfig,
    @Inject(LOGGER) private readonly logger: Logger,
    @Inject(AcceptanceEventsService) private readonly events: AcceptanceEventsService,
  ) {}

  private fakeSignature(): FakeSignatureProvider {
    if (
      this.config.NODE_ENV === "production" ||
      !(this.signature instanceof FakeSignatureProvider)
    ) {
      throw new ProblemError("NOT_FOUND");
    }
    return this.signature;
  }

  private fakePayments(): FakePaymentsProvider {
    if (this.config.NODE_ENV === "production" || !(this.payments instanceof FakePaymentsProvider)) {
      throw new ProblemError("NOT_FOUND");
    }
    return this.payments;
  }

  private ref(value: string) {
    return parseInput(z.string().regex(/^[a-z]+-[0-9a-f-]{36,80}$/), value);
  }

  @Get("signature/:ref")
  @Public()
  envelope(@Param("ref") ref: string) {
    return this.fakeSignature()
      .envelope(this.ref(ref))
      .catch(() => {
        throw new ProblemError("NOT_FOUND");
      });
  }

  @Post("signature/:ref/sign")
  @HttpCode(200)
  @Public()
  async sign(@Param("ref") ref: string, @Body() body: unknown) {
    const provider = this.fakeSignature();
    const providerRef = this.ref(ref);
    const webhook = await provider.sign(providerRef, parseInput(codeSchema, body).code);
    if (!webhook) {
      throw new ProblemError("VALIDATION_FAILED", undefined, [
        { path: "code", issue: "OTP_INVALID" },
      ]);
    }
    await this.events.signatureWebhook(webhook.headers, webhook.body);
    return { returnUrl: (await provider.envelope(providerRef)).returnUrl };
  }

  @Get("payments/:ref")
  @Public()
  checkout(@Param("ref") ref: string) {
    return this.fakePayments()
      .checkout(this.ref(ref))
      .catch(() => {
        throw new ProblemError("NOT_FOUND");
      });
  }

  @Post("payments/:ref/pay")
  @HttpCode(200)
  @Public()
  async pay(@Param("ref") ref: string, @Body() body: unknown) {
    const provider = this.fakePayments();
    const providerRef = this.ref(ref);
    const input = parseInput(payFakeSchema, body);
    const checkout = await provider.checkout(providerRef).catch(() => {
      throw new ProblemError("NOT_FOUND");
    });
    // A checkout closed by AstAx (the customer chose another offer) cannot be paid.
    if (checkout.cancelled) {
      throw new ProblemError("CONFLICT", "The payment is no longer open", [
        { path: "payment", issue: "PAYMENT_CLOSED" },
      ]);
    }
    const webhook = provider.pay(providerRef, input);
    await this.events.paymentWebhook(webhook.headers, webhook.body);
    if (input.method === "INSTANT_TRANSFER") {
      // docs/adattatori.md: the instant transfer is confirmed after 5 seconds (proposal I).
      setTimeout(() => {
        const confirmed = provider.confirmTransfer(providerRef);
        this.events
          .paymentWebhook(confirmed.headers, confirmed.body)
          .catch((error: unknown) =>
            this.logger.warn({ err: errorForLog(error) }, "fake transfer not confirmed"),
          );
      }, 5_000).unref();
    }
    const status = JSON.parse(webhook.body) as { status: string };
    return { returnUrl: checkout.returnUrl, status: status.status };
  }

  /** Development tools (proposal I): the instant transfer confirmed at once. */
  @Post("payments/:ref/confirm")
  @HttpCode(200)
  @Public()
  async confirm(@Param("ref") ref: string) {
    // Rule 13: a development tool, only with DEV_TOOLS=true.
    if (!this.config.DEV_TOOLS) throw new ProblemError("NOT_FOUND");
    const webhook = this.fakePayments().confirmTransfer(this.ref(ref));
    await this.events.paymentWebhook(webhook.headers, webhook.body);
    return { confirmed: true };
  }
}
