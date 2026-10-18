-- Phase 7 (decision E): the internal register of the support tickets.

CREATE TYPE "SupportTicketStatus" AS ENUM ('OPEN', 'WAITING_CUSTOMER', 'CLOSED');
CREATE TYPE "SupportChannel" AS ENUM ('EMAIL', 'PHONE', 'CHAT');

CREATE TABLE "SupportTicket" (
  "id" UUID NOT NULL,
  "number" SERIAL NOT NULL,
  "subject" TEXT NOT NULL,
  "channel" "SupportChannel" NOT NULL,
  "status" "SupportTicketStatus" NOT NULL DEFAULT 'OPEN',
  "contactEmailEnc" TEXT,
  "locale" "Locale" NOT NULL DEFAULT 'it',
  "customerId" UUID,
  "quoteRequestId" UUID,
  "assignedToUserId" UUID,
  "createdByUserId" UUID NOT NULL,
  "dueAt" TIMESTAMPTZ(3) NOT NULL,
  "firstAnsweredAt" TIMESTAMPTZ(3),
  "closedAt" TIMESTAMPTZ(3),
  "createdAt" TIMESTAMPTZ(3) NOT NULL,
  "updatedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "SupportTicket_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "SupportTicket_number_key" ON "SupportTicket" ("number");
CREATE INDEX "SupportTicket_status_dueAt_idx" ON "SupportTicket" ("status", "dueAt");
CREATE INDEX "SupportTicket_customerId_idx" ON "SupportTicket" ("customerId");

CREATE TABLE "SupportTicketMessage" (
  "id" UUID NOT NULL,
  "ticketId" UUID NOT NULL,
  "kind" TEXT NOT NULL,
  "text" TEXT NOT NULL,
  "authorUserId" UUID NOT NULL,
  "createdAt" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "SupportTicketMessage_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "SupportTicketMessage_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "SupportTicket" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE INDEX "SupportTicketMessage_ticketId_idx" ON "SupportTicketMessage" ("ticketId");

CREATE TRIGGER set_updated_at BEFORE UPDATE ON "SupportTicket" FOR EACH ROW EXECUTE FUNCTION set_updated_at();

ALTER TABLE "SupportTicket" ENABLE ROW LEVEL SECURITY;
CREATE POLICY support_ticket_select ON "SupportTicket" FOR SELECT USING (app_is_privileged());
CREATE POLICY support_ticket_write ON "SupportTicket" FOR ALL
  USING (app_is_privileged()) WITH CHECK (app_is_privileged());
ALTER TABLE "SupportTicketMessage" ENABLE ROW LEVEL SECURITY;
CREATE POLICY support_ticket_message_select ON "SupportTicketMessage" FOR SELECT USING (app_is_privileged());
CREATE POLICY support_ticket_message_insert ON "SupportTicketMessage" FOR INSERT
  WITH CHECK (app_is_privileged());
