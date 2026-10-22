import { readFileSync } from "node:fs";
import { join } from "node:path";
import { findRepoRoot } from "../env/index.js";
import { parse } from "yaml";
import { z } from "zod";
import { formatDate, formatEuroCents, formatNotificationDateTime } from "../format/index.js";

const localized = z.looseObject({
  title: z.string().optional(),
  body: z.string().optional(),
  emailSubject: z.string().optional(),
  emailBody: z.string().optional(),
  sms: z.string().optional(),
});
const fileSchema = z.object({
  schemaVersion: z.literal(1),
  labels: z.record(z.string(), z.object({ it: z.string() })).default({}),
  events: z.record(
    z.string(),
    z.looseObject({
      variables: z.array(z.string()).default([]),
      it: localized,
    }),
  ),
});

export type NotificationTemplates = z.infer<typeof fileSchema>["events"];
export type NotificationLabels = z.infer<typeof fileSchema>["labels"];

/** The labels of seed/notifiche.yaml, for the variables of the texts. */
export function loadNotificationLabels(
  repoRoot: string = findRepoRoot(import.meta.dirname),
): NotificationLabels {
  return fileSchema.parse(parse(readFileSync(join(repoRoot, "seed", "notifiche.yaml"), "utf8")))
    .labels;
}

export function label(labels: NotificationLabels, key: string): string {
  const entry = labels[key];
  if (!entry) throw new Error(`No label ${key}`);
  return entry.it;
}

/**
 * Texts of seed/notifiche.yaml. Phase 7 moves them to NotificationTemplate,
 * editable by the administrator; until then they are read from the file.
 */
export function loadNotificationTemplates(
  repoRoot: string = findRepoRoot(import.meta.dirname),
): NotificationTemplates {
  return fileSchema.parse(parse(readFileSync(join(repoRoot, "seed", "notifiche.yaml"), "utf8")))
    .events;
}

export class MissingTemplateVariableError extends Error {
  constructor(readonly variable: string) {
    super(`Missing template variable ${variable}`);
    this.name = "MissingTemplateVariableError";
  }
}

/**
 * A variable of a text: already a string, or a value the engine formats
 * (docs/notifiche.md): an amount in cents, a date, a moment, a label of a list
 * (seed/notifiche.yaml «labels»).
 */
export type TemplateValue =
  string | { cents: number } | { date: string } | { dateTime: string } | { label: string };

export type TemplateVariables = Readonly<Record<string, TemplateValue>>;

export interface RenderContext {
  labels?: NotificationLabels;
}

function formatted(value: TemplateValue, ctx: RenderContext): string {
  if (typeof value === "string") return value;
  if ("cents" in value) return formatEuroCents(value.cents);
  if ("date" in value) return formatDate(value.date);
  if ("dateTime" in value) return formatNotificationDateTime(value.dateTime);
  return ctx.labels ? label(ctx.labels, value.label) : value.label;
}

/**
 * Replaces {{name}}; a missing variable is an error, never an empty hole in a
 * message. An empty value leaves no double spaces, no space before a
 * punctuation mark and no empty line (docs/notifiche.md).
 */
export function render(
  template: string,
  variables: TemplateVariables,
  ctx: RenderContext = {},
): string {
  return template
    .split("\n")
    .flatMap((line) => {
      const out = line.replace(/\{\{\s*([a-z_]+)\s*\}\}/g, (_match, name: string) => {
        const value = variables[name];
        if (value === undefined) throw new MissingTemplateVariableError(name);
        return formatted(value, ctx);
      });
      const cleaned = out.replace(/ {2,}/g, " ").replace(/ +([.,;:!?)])/g, "$1");
      // A line that held only variables, now empty, disappears.
      return line.trim() !== "" && cleaned.trim() === "" ? [] : [cleaned.trimEnd()];
    })
    .join("\n");
}

function textsOf(templates: NotificationTemplates, eventKey: string) {
  return templates[eventKey]?.it;
}

export function renderEmail(
  templates: NotificationTemplates,
  eventKey: string,
  variables: TemplateVariables,
  labels?: NotificationLabels,
): { subject: string; text: string } {
  const texts = textsOf(templates, eventKey);
  if (!texts?.emailSubject || !texts.emailBody) throw new Error(`No email text for ${eventKey}`);
  const ctx = labels ? { labels } : {};
  return {
    subject: render(texts.emailSubject, variables, ctx),
    text: render(texts.emailBody, variables, ctx).trim(),
  };
}

export function renderInApp(
  templates: NotificationTemplates,
  eventKey: string,
  variables: TemplateVariables,
  labels?: NotificationLabels,
): { title: string; body: string } {
  const texts = textsOf(templates, eventKey);
  if (!texts?.title || !texts.body) throw new Error(`No in-app text for ${eventKey}`);
  const ctx = labels ? { labels } : {};
  return { title: render(texts.title, variables, ctx), body: render(texts.body, variables, ctx) };
}

export function renderSms(
  templates: NotificationTemplates,
  eventKey: string,
  variables: TemplateVariables,
): string {
  const text = textsOf(templates, eventKey)?.sms;
  if (!text) throw new Error(`No SMS text for ${eventKey}`);
  return render(text, variables);
}

/** The push: the in-app title and body (docs/notifiche.md, «push» channel). */
export function renderPush(
  templates: NotificationTemplates,
  eventKey: string,
  variables: TemplateVariables,
  labels?: NotificationLabels,
): { title: string; body: string } {
  return renderInApp(templates, eventKey, variables, labels);
}
