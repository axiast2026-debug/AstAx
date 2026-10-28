# Adattatori verso i fornitori

Ogni servizio esterno passa da una porta (interfaccia TypeScript) in `packages/adapters`. Ogni porta ha due implementazioni: quella finta, deterministica, usata in sviluppo e nei test; quella vera, aggiunta in fase 8 con le sandbox. Il resto del codice conosce solo la porta. La scelta dell'implementazione avviene in un unico punto, dalla configurazione.

Regole comuni:

- Gli adattatori veri hanno timeout, nuovi tentativi con attesa crescente sugli errori temporanei e registrano solo identificativi e codici di errore (SIC-06).
- I webhook in arrivo verificano la firma del fornitore e si elaborano una volta sola (chiave di idempotenza).
- Ogni porta ha una suite di test di contratto che gira sull'adattatore finto e, in fase 8, sulla sandbox.
- L'adattatore finto non chiama la rete e riconosce valori speciali per simulare errori.

## Adattatori veri: stato (fase 8)

La scelta tra finto e vero è nella configurazione: `EMAIL_PROVIDER`, `SMS_PROVIDER`, `PUSH_PROVIDER`, `KMS_PROVIDER`, `AI_PROVIDER`, `PLATE_PROVIDER`, `SDI_PROVIDER` (valore `fake` predefinito). I test di contratto sono in `packages/adapters/src/contracts/` e girano sul finto, sul vero con il fornitore simulato e, con le credenziali della sandbox, sul fornitore vero (vedi il README della cartella).

| Porta | Adattatore vero | Stato |
| --- | --- | --- |
| Email | `SesEmailSender` (Amazon SES) | Scritto e provato con SES simulato; manca la sandbox |
| SMS | `AwsSmsSender` (AWS End User Messaging, mittente «AstAx») | Scritto e provato con AWS simulato; manca la sandbox |
| Push | `VapidWebPush` (Web Push con chiavi VAPID, ADR 0011) | Scritto e provato |
| KMS | `AwsKms` | Scritto e provato con KMS simulato (contesto e permessi); manca l'account AWS |
| Lettura documenti, spiegazione AI | `BedrockDocumentReader`, `BedrockAiExplainer` (Claude su Bedrock, profilo UE) | Scritti e provati con modello simulato; prompt in `packages/adapters/prompts/`; manca l'accesso a Bedrock |
| Dati veicolo | `OpenapiPlateLookup` (IT-car, IT-insurance) | Scritto dalla specifica OpenAPI pubblica; manca il token della sandbox |
| Banca Dati ANIA | `HttpAniaReader` verso il bot del portale agenzie (repository privato `astax-ania-bot`, lo stesso di CorteXa) | Installato sul server della demo; manca il primo login di Dan ([ADR 0022](adr/0022-ania-vero-nella-demo.md)) |
| Fatturazione SDI | `OpenapiEInvoicing` (e ricevute su `POST /webhooks/sdi`) | Scritto dalla specifica OpenAPI pubblica; manca il token della sandbox |
| Firma FEA | Namirial | Da scrivere nella parte B: la documentazione pubblica non mostra il formato della busta e delle notifiche |
| Pagamenti | Fabrick | Da scrivere nella parte B: la documentazione è riservata ai clienti |
| Registro RUI | IVASS (file aperti) | Da scrivere nella parte B: serve un file reale per le colonne esatte |

Le firme qui sotto sono il punto di partenza: Claude Code può raffinarle, mantenendo il significato.

## Tempo

```ts
export interface Clock {
  now(): Date;
}
```

Nessun `new Date()` o `Date.now()` nel codice di dominio. I test usano un orologio controllabile; i workflow usano il tempo di Temporal.

## Dati veicolo da targa (Openapi Automotive; alternativa InfoTarga)

```ts
export interface PlateLookupPort {
  lookup(input: { plate: string; vehicleType?: VehicleType }): Promise<PlateLookupResult>;
}
export type PlateLookupResult =
  | {
      found: true;
      vehicle: {
        make: string; model: string; version?: string; providerCode?: string;
        fuel?: FuelType; displacementCc?: number; powerKw?: number; firstRegistrationDate?: string;
      };
      insurance?: { companyName?: string; expiryDate?: string };
    }
  | { found: false; reason: "NOT_FOUND" | "INVALID_PLATE" | "PROVIDER_ERROR" };
```

Finto: dati coerenti ricavati dalla targa (sempre gli stessi per la stessa targa); `ZZ000ZZ` → `NOT_FOUND`; `XX999XX` → `PROVIDER_ERROR`.

## Banca Dati ANIA da targa (Dan, 2026-10-28)

```ts
export interface AniaReaderPort {
  read(input: { plate: string; owner?: { fiscalCode: string; fullName: string } | null }): Promise<AniaReadResult>;
}
export type AniaReadResult =
  | { found: true; record: AniaRecordData } // veicolo, intestatario, immatricolazioni, ultima copertura, ultimo attestato
  | { found: false; reason: "NOT_FOUND" | "INVALID_PLATE" | "PROVIDER_ERROR" };
```

- La scheda per le agenzie e gli avvisi si ricavano dal record in `packages/shared/src/domain/ania.ts`, con le stesse regole del bot costruito per CorteXa, rifatte qui: date senza ora; categoria e uso separati (un codice non confermato dà l'avviso «verificare sul libretto di circolazione»); peso a pieno carico solo per gli autocarri; nascita, sesso e luogo dal codice fiscale; cognome e nome solo se l'avente diritto ha il codice fiscale dell'intestatario; data di acquisto dalla riga di immatricolazione più vecchia con quel codice fiscale; sinistri degli ultimi anni (`verification.ania.claimsYears`), con N.D. che rende il totale ignoto; copertura scaduta solo dal giorno dopo la scadenza, in scadenza entro `verification.ania.expiryNoticeDays`.
- L'API controlla ogni risposta con `AniaRecordSchema`, la salva cifrata sulla verifica e nel registro scrive solo che è stata letta.
- Finto (`FakeAniaReader`): veicolo, compagnia e scadenza come il finto dei dati veicolo; intestatario = il proprietario della richiesta; `ZZ000ZZ` → `NOT_FOUND`; `XX999XX` → `PROVIDER_ERROR`; targhe che iniziano con `NV` senza attestato.
- Vero: `HttpAniaReader` (`ANIA_PROVIDER=http`, `ANIA_BOT_URL`, `ANIA_BOT_TOKEN`) verso il bot del portale agenzie, lo stesso costruito per CorteXa, nel repository privato `astax-ania-bot`: `POST /ania/consultazioni?attendi=1` con targa, richiesta e operatore, poi `GET /ania/consultazioni/:jobId` finché la lettura è in coda; la «scheda» del bot diventa il record di AstAx (`recordFromScheda`). `SESSION_EXPIRED` dice all'operatore che serve un nuovo login. Il login si fa dal back office, pagina «Portale ANIA»: `AniaLoginPort` (`open`, `screen`, `act`, `state`) verso `/ania/login/*` del bot, con lo schermo del suo browser; l'API (`/verification/ania-login/*`, solo `verification.decide`) registra apertura e collegamento, mai il testo scritto. Via scritto di Allianz del 2026-10-28; sulla demo per scelta di Dan ([ADR 0022](adr/0022-ania-vero-nella-demo.md)). Prova di contratto unica per finto e bot simulato.

## Lettura documenti (Claude tramite Amazon Bedrock, profilo di inferenza UE)

```ts
export type ExtractableDocument =
  | "REGISTRATION_CERTIFICATE" | "DRIVING_LICENCE" | "RISK_CERTIFICATE" | "FISCAL_CODE_CARD" | "QUOTE_PDF";

export interface DocumentReaderPort {
  extract(input: { kind: ExtractableDocument; files: StoredFileRef[] }): Promise<ExtractionResult>;
}
export interface ExtractionResult {
  kind: ExtractableDocument;
  fields: Record<string, { value: string | number | boolean | null; confidence: number }>;
  warnings: string[];
  model: string;
  promptVersion: string;
}
```

- Uscita strutturata con uno schema per tipo di documento; confidenza da 0 a 1 per campo. Sotto la soglia (`documents.confidenceThreshold`, 0,9) il campo va in revisione del back office.
- `QUOTE_PDF` estrae premio, compagnia e coperture del preventivo, per il controllo OFF-09.
- I prompt stanno in file versionati (`packages/adapters/src/document-reader/prompts/`), con un numero di versione salvato insieme al risultato.
- Finto: risultati da file di esempio in `fixtures/`; un nome file che contiene `low-confidence` restituisce confidenze 0,6.
- Vero: contratto UE, nessun uso dei dati per l'addestramento, documenti passati come immagini o PDF.

## Spiegazione del confronto AI (Claude tramite Bedrock)

```ts
export interface AiExplainerPort {
  explain(input: {
    offers: ScoredOfferSummary[];
    recommendedOfferId: string;
    weights: AiWeights;
    locale: "it";
  }): Promise<{ text: string; model: string; promptVersion: string }>;
}
```

- Il punteggio lo calcola il dominio (PRES-07); qui si scrive solo il testo, al massimo 600 caratteri, senza dati personali.
- Il testo viene controllato prima di mostrarlo: deve citare l'offerta consigliata e non contenere cifre diverse da quelle ricevute; se il controllo fallisce si mostra un testo di riserva costruito dal punteggio.
- Finto: testo costruito da un modello fisso.

## Busta chiusa e cifratura dei campi (AWS KMS)

```ts
export interface SealedBidCryptoPort {
  createAuctionKeys(auctionId: string): Promise<{ publicKey: string; wrappedPrivateKey: string; keyRef: string }>;
  seal(publicKey: string, plaintext: Uint8Array): Promise<Uint8Array>;
  openAtClosing(input: { auctionId: string; wrappedPrivateKey: string; sealed: Uint8Array[] }): Promise<Uint8Array[]>;
}
export interface OwnerCopyCryptoPort {
  encrypt(ctx: { organizationId: string; offerId: string }, plaintext: Uint8Array): Promise<Uint8Array>;
  decrypt(ctx: { organizationId: string; offerId: string }, ciphertext: Uint8Array): Promise<Uint8Array>;
}
export interface FieldCryptoPort {
  encrypt(field: SensitiveField, value: string): Promise<string>;
  decrypt(field: SensitiveField, ciphertext: string): Promise<string>;
  blindIndex(field: SensitiveField, value: string): string;
}
```

`openAtClosing` esiste solo nel pacchetto caricato dal worker. Dettagli: [`busta-chiusa.md`](busta-chiusa.md).

## File (S3)

```ts
export interface ObjectStoragePort {
  put(input: { key: string; body: Uint8Array; contentType: string }): Promise<void>;
  get(key: string): Promise<Uint8Array>;
  signedDownloadUrl(key: string, opts: { expiresInSeconds: number; fileName?: string }): Promise<string>;
  delete(key: string): Promise<void>;
}
```

In sviluppo MinIO. I documenti delle agenzie passano dall'API, che applica la filigrana (VIS-10) prima di restituirli: niente link diretti allo storage per le agenzie.

## Firma FEA con OTP (Namirial; alternativa InfoCert)

```ts
export interface SignaturePort {
  createEnvelope(input: {
    signer: { firstName: string; lastName: string; fiscalCode: string; phone: string; email: string };
    documents: { id: string; title: string; file: StoredFileRef }[];
    returnUrl: string;
  }): Promise<{ envelopeId: string; signingUrl: string }>;
  getEnvelope(envelopeId: string): Promise<{
    status: "PENDING" | "SIGNED" | "REJECTED" | "EXPIRED";
    signedFiles?: StoredFileRef[];
    evidenceFile?: StoredFileRef;
  }>;
  parseWebhook(headers: Record<string, string>, body: string): SignatureEvent;
}
```

Finto: pagina interna che chiede un codice (sempre `123456` in sviluppo) e produce PDF con una pagina di firma e un file di evidenze.

## Pagamenti (Fabrick; alternativa Nexi)

```ts
export interface PaymentsPort {
  createCheckout(input: {
    paymentId: string; idempotencyKey: string;
    amounts: { premiumCents: number; feeCents: number };
    methods: ("CARD" | "INSTANT_TRANSFER")[];
    payer: { firstName: string; lastName: string; email: string };
    returnUrl: string;
  }): Promise<{ providerRef: string; redirectUrl: string }>;
  getStatus(providerRef: string): Promise<PaymentStatus>;
  refund(input: { providerRef: string; amountCents: number; idempotencyKey: string }): Promise<{ refundRef: string; status: RefundStatus }>;
  parseWebhook(headers: Record<string, string>, body: string): PaymentEvent;
}
```

- Premio sul conto separato e fee sul conto operativo (decisione aggiunta 21).
- Finto: pagina di pagamento simulata; carta che finisce con `0002` → rifiutata; bonifico istantaneo confermato dopo 5 secondi; i webhook si possono innescare da un endpoint di sviluppo.

## Fatturazione elettronica SDI (Openapi SDI; alternativa A-Cube)

```ts
export interface EInvoicingPort {
  send(invoice: FatturaPaInput): Promise<{ sdiRef: string; status: SdiStatus }>;
  getStatus(sdiRef: string): Promise<SdiStatus>;
  parseWebhook(headers: Record<string, string>, body: string): SdiEvent;
}
```

`FatturaPaInput` contiene già natura IVA, riferimento normativo e bollo, presi dai parametri. Il dominio produce i dati della fattura; l'adattatore produce l'XML. Finto: stati `SENT` → `DELIVERED` dopo pochi secondi; partita IVA `00000000000` → `REJECTED`. L'XML si controlla sempre contro lo schema ufficiale FatturaPA 1.2.2 prima dell'invio (ADR 0009).

## Comunicazioni

```ts
export interface EmailPort { send(input: { to: string; subject: string; html: string; text: string; tags?: string[] }): Promise<void>; }
export interface SmsPort { send(input: { to: string; text: string }): Promise<void>; }
export interface PushPort { send(input: { subscription: PushSubscriptionData; title: string; body: string; url: string }): Promise<"SENT" | "GONE">; }
```

- Email: Amazon SES (UE, DKIM); in sviluppo Mailpit, che mostra le email in una pagina web.
- SMS: provider italiano o Twilio, mittente «AstAx»; finto: scrive nel log di sviluppo e in Mailpit.
- Push: Web Push con chiavi VAPID, vero anche in sviluppo.
- WhatsApp: fase 2, porta già prevista ma disattivata.

## Registro degli intermediari (IVASS)

```ts
export interface RuiRegistryPort {
  downloadLatest(): Promise<AsyncIterable<RuiRecordInput>>;
}
```

Import periodico degli elenchi pubblici in `RuiRecord`; la verifica all'ingresso cerca nel database locale. Finto: piccolo file CSV di esempio con intermediari inventati.

## Identità (Keycloak)

```ts
export interface IdentityPort {
  createUser(input: { email: string; firstName: string; lastName: string; kind: UserKind }): Promise<{ keycloakId: string }>;
  requireActions(keycloakId: string, actions: ("CONFIGURE_TOTP" | "UPDATE_PASSWORD" | "VERIFY_EMAIL")[]): Promise<void>;
  disable(keycloakId: string): Promise<void>;
  enable(keycloakId: string): Promise<void>;
  resetSecondFactor(keycloakId: string): Promise<void>;
  revokeSessions(keycloakId: string): Promise<void>;
  listSessions(keycloakId: string): Promise<SessionInfo[]>;
}
```

Keycloak gira in Docker anche in sviluppo, con un realm `astax` importato da file. Non serve un adattatore finto.

## Assistenza (strumento esterno nell'MVP)

```ts
export interface SupportPort {
  ticketLink(input: { context: "REQUEST" | "POLICY"; code: string; userId: string }): string;
}
```

Nell'MVP apre lo strumento esterno (per esempio Crisp o Zendesk) con il codice della richiesta. Modulo interno in fase 2.

## Generati in casa, senza fornitore

- File dei bonifici SEPA (`pain.001`) per le rimesse.
- Lettura dell'estratto conto (CSV o `camt.053`) per la riconciliazione assistita.
- Filigrana su PDF e immagini.
- Calcolo e controllo del codice fiscale, con l'elenco dei comuni ISTAT e dei codici catastali.
