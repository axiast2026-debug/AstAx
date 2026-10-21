import { actorRoleOf, can, type Action, type Actor } from "@astax/shared/permissions";

/**
 * Menus of every user type, from the role sheets in docs/specifiche (02-07).
 * Labels are translation keys (`menu.<key>`); an item shows only if the actor
 * holds its permission. Hiding is not protection: the API checks again (SIC-01).
 */
export interface MenuItem {
  key: string;
  href: string;
  action: Action;
}

const item = (key: string, href: string, action: Action): MenuItem => ({ key, href, action });

/**
 * 03 — private customer: four items, also the bar at the bottom of a phone
 * (Dan, 2026-10-21, docs/piano-flusso-semplificato.md). Documents, help and
 * complaints are in the profile and at the bottom of every page (PRIVATE_LINKS).
 */
const PRIVATE_MENU: MenuItem[] = [
  item("home", "/", "profile.view"),
  item("quotes", "/preventivi", "request.viewOwn"),
  item("policies", "/polizze", "request.viewOwn"),
  item("profile", "/profilo", "profile.view"),
];

/** The other pages of the private customer, linked from the profile and the footer. */
export const PRIVATE_LINKS: MenuItem[] = [
  item("documents", "/documenti", "request.viewOwn"),
  item("support", "/assistenza", "profile.view"),
  item("complaints", "/reclami", "complaint.open"),
];

/**
 * 02 — broker owner and operators: a short menu around the work table of
 * «Richieste» and the lots from Excel (Dan, 2026-10-21, docs/piano-broker.md
 * G and C-E); the other pages are at the bottom of every page (BROKER_LINKS).
 */
const BROKER_MENU: MenuItem[] = [
  item("requests", "/richieste", "request.viewOwn"),
  item("batches", "/lotti", "request.bulkUpload"),
  item("customers", "/clienti", "brokerCustomer.manage"),
  item("policies", "/polizze", "request.viewOwn"),
  item("accounting", "/contabilita", "accounting.brokerStatement"),
  item("team", "/team", "team.manage"),
];

/** The broker's other pages, at the bottom of every page. */
export const BROKER_LINKS: MenuItem[] = [
  item("dashboard", "/", "request.viewOwn"),
  item("renewals", "/rinnovi", "request.viewOwn"),
  item("settings", "/impostazioni", "organization.editProfile"),
];

/** The links at the bottom of the page for the active context, filtered by permission. */
export function linksFor(actor: Actor): MenuItem[] {
  const role = actorRoleOf(actor);
  const links =
    role === "PRIVATE"
      ? PRIVATE_LINKS
      : role === "BROKER_OWNER" || role === "BROKER_OPERATOR"
        ? BROKER_LINKS
        : [];
  return links.filter((entry) => can(actor, entry.action));
}

/** 04 — agency owner and supervisor. */
const AGENCY_MENU: MenuItem[] = [
  item("dashboard", "/", "request.viewQuoteData"),
  item("incomingRequests", "/richieste-in-arrivo", "request.viewQuoteData"),
  item("myOffers", "/le-mie-offerte", "offer.submit"),
  item("toIssue", "/da-emettere", "issuance.manage"),
  item("issuedPolicies", "/polizze", "issuance.manage"),
  item("results", "/risultati", "ranking.view"),
  item("filters", "/filtri", "agencyFilters.manage"),
  item("accounting", "/contabilita", "accounting.agencyStatement"),
  item("team", "/team", "team.manage"),
  item("agency", "/agenzia", "organization.editProfile"),
];

/** 05 — agency operator (sub-agent). */
const SUB_AGENT_MENU: MenuItem[] = [
  item("personalDashboard", "/", "request.viewQuoteData"),
  item("incomingRequests", "/richieste-in-arrivo", "request.viewQuoteData"),
  item("myOffers", "/le-mie-offerte", "offer.submit"),
  item("toIssue", "/da-emettere", "issuance.manage"),
  item("myResults", "/risultati", "ranking.view"),
  item("myFilters", "/filtri", "memberFilters.manageOwn"),
];

/** 06 — back office, each item shown to the roles that may use it. */
const BACK_OFFICE_MENU: MenuItem[] = [
  item("operationsDashboard", "/", "backOffice.dashboard"),
  item("verificationQueue", "/verifiche", "verification.viewQueue"),
  item("auctions", "/aste", "auction.viewStatus"),
  item("exceptions", "/eccezioni", "issuance.decideMissed"),
  item("payments", "/pagamenti", "accounting.view"),
  item("onboardingQueue", "/ingressi", "organization.approveOnboarding"),
  item("organizations", "/organizzazioni", "organization.approveOnboarding"),
  item("customers", "/clienti", "accessLog.viewCustomer"),
  item("support", "/assistenza", "support.tickets"),
  item("complaints", "/reclami", "complaint.register"),
  item("flags", "/segnalazioni", "complaint.manage"),
  item("invoicing", "/fatturazione", "accounting.view"),
  item("auditLog", "/registro", "auditLog.viewAll"),
];

/** 07 — administrator. */
const ADMIN_MENU: MenuItem[] = [
  item("adminDashboard", "/", "admin.reports.view"),
  item("auctionRules", "/regole-asta", "admin.settings.manage"),
  item("packages", "/pacchetti", "admin.catalog.manage"),
  item("listsHolidays", "/elenchi-festivita", "admin.catalog.manage"),
  item("economy", "/economia", "admin.settings.manage"),
  item("systemSettings", "/sicurezza-dati", "admin.settings.manage"),
  item("complaintsIndex", "/indice-reclami", "admin.settings.manage"),
  item("users", "/utenti", "admin.users.manage"),
  item("organizations", "/organizzazioni", "organization.suspend"),
  item("legalDocuments", "/documenti-legali", "admin.legal.manage"),
  item("communications", "/comunicazioni", "admin.notifications.manage"),
  item("integrations", "/integrazioni", "admin.reports.view"),
  item("auditLog", "/registro", "auditLog.viewAll"),
  item("reports", "/report", "admin.reports.view"),
];

/** The menu of the active context, already filtered by permission. */
export function menuFor(actor: Actor): MenuItem[] {
  const role = actorRoleOf(actor);
  let menu: MenuItem[];
  switch (role) {
    case "PRIVATE":
      menu = PRIVATE_MENU;
      break;
    case "BROKER_OWNER":
    case "BROKER_OPERATOR":
      menu = BROKER_MENU;
      break;
    case "AGENCY_OWNER":
    case "AGENCY_SUPERVISOR":
      menu = AGENCY_MENU;
      break;
    case "AGENCY_OPERATOR":
      menu = SUB_AGENT_MENU;
      break;
    case "ADMIN":
      menu = ADMIN_MENU;
      break;
    case "BO_VERIFIER":
    case "BO_SUPPORT":
    case "BO_ACCOUNTING":
    case "BO_SUPERVISOR":
      menu = BACK_OFFICE_MENU;
      break;
    default:
      menu = [];
  }
  return menu.filter((entry) => can(actor, entry.action));
}

/** Every key used by menus: the translation files must have them all. */
export const MENU_KEYS = [
  ...new Set(
    [
      PRIVATE_MENU,
      PRIVATE_LINKS,
      BROKER_MENU,
      BROKER_LINKS,
      AGENCY_MENU,
      SUB_AGENT_MENU,
      BACK_OFFICE_MENU,
      ADMIN_MENU,
    ].flatMap((m) => m.map((entry) => entry.key)),
  ),
];
