import {
  formatDateTime,
  formatTime,
  formatWeekdayDate,
  romeCalendarDate,
} from "@astax/shared/format";
import { Icon } from "@astax/ui";
import { getTranslations } from "next-intl/server";
import { AddToCalendar } from "@/components/add-to-calendar";
import { CountdownRing, type WorkingTime } from "@/components/countdown-ring";
import { PushSwitch } from "@/components/push-switch";
import { SealedEnvelopes } from "@/components/sealed-envelopes";
import type { RequestDetail } from "@/lib/requests";

export interface LiveAuction extends Omit<WorkingTime, "serverNow"> {
  round: number;
  kind: string;
  scheduledCloseAt: string;
  offers: number | null;
  invitedAgencies?: number;
  envelopesAt: string[];
}

/** The timeline entries that belong to the running round (proposal P2). */
const DIARY_EVENTS = new Set([
  "AUCTION_OPENED",
  "AUCTION_REOPENED",
  "RECONFIRMATION_OPENED",
  "AUCTION_TOPPED_UP",
  "AUCTION_INVITATIONS_ADDED",
  "AUCTION_EXTENDED",
]);
const ROUND_STARTS = new Set(["AUCTION_OPENED", "AUCTION_REOPENED", "RECONFIRMATION_OPENED"]);

/**
 * «Asta in corso», Momento 2 (VIS-03, ASTA-02): the time ring on night blue,
 * the sealed envelopes as they arrive, the diary of true events (P2) and
 * what happens at the closing. No price, no company, no agency; the broker
 * also sees how many agencies are invited.
 */
export async function AuctionLive({
  auction,
  serverNow,
  timeline,
  requestId,
  isPrivate,
}: {
  auction: LiveAuction;
  serverNow: string;
  timeline: RequestDetail["timeline"];
  requestId: string;
  isPrivate: boolean;
}) {
  const t = await getTranslations("auctionView");
  const te = await getTranslations("timeline");
  const tp = await getTranslations("profile.notifications.push");
  const close = auction.scheduledCloseAt;
  const today = romeCalendarDate(new Date(serverNow));
  const when = (at: string) => {
    const day = romeCalendarDate(new Date(at));
    if (day === today) return t("todayAt", { time: formatTime(at) });
    const tomorrow = romeCalendarDate(new Date(Date.parse(`${today}T12:00:00Z`) + 86_400_000));
    if (day === tomorrow) return t("tomorrowAt", { time: formatTime(at) });
    return t("dayAt", { day: formatWeekdayDate(at), time: formatTime(at) });
  };
  const resumes = auction.pausedUntil ? when(auction.pausedUntil) : null;
  const time: WorkingTime = { ...auction, serverNow };
  const count = auction.offers ?? 0;
  const reconfirmation = auction.kind === "RECONFIRMATION";

  // P2: the true events of this round and one line per envelope, the latest first.
  const lastStart = timeline.reduce((found, e, i) => (ROUND_STARTS.has(e.type) ? i : found), -1);
  const diary = [
    ...timeline
      .slice(Math.max(lastStart, 0))
      .filter((e) => DIARY_EVENTS.has(e.type))
      .map((e) => ({ at: e.at, text: te(e.type) })),
    ...auction.envelopesAt.map((at, i) => ({
      at,
      text: t(reconfirmation ? "diaryAnswer" : "diaryEnvelope", { n: i + 1 }),
    })),
  ].sort((a, b) => Date.parse(b.at) - Date.parse(a.at));
  const stamp = (at: string) =>
    romeCalendarDate(new Date(at)) === today ? formatTime(at) : formatDateTime(at);

  return (
    <div className="flex flex-col gap-4 lg:gap-6">
      {auction.kind === "REOPEN" ? (
        <div role="status" className="flex items-start gap-3 rounded-xl bg-info-50 px-4 py-3">
          <span className="inline-flex pt-0.5 text-info-700">
            <Icon name="info" />
          </span>
          <span className="text-table">
            {t.rich("reopened", {
              close: when(close),
              b: (c) => <b className="text-info-700">{c}</b>,
            })}
          </span>
        </div>
      ) : null}

      <section
        aria-labelledby="auction-live-title"
        className="on-dark flex flex-col items-center gap-4 rounded-3xl bg-night-900 px-4 py-6 text-center text-white lg:flex-row lg:gap-8 lg:p-8 lg:text-left"
      >
        <span className="lg:hidden">
          <CountdownRing time={time} size={200} onDark resumeLabel={resumes} />
        </span>
        <span className="hidden lg:block">
          <CountdownRing time={time} size={220} onDark resumeLabel={resumes} />
        </span>
        <div className="flex flex-col gap-2">
          <h2 id="auction-live-title" className="font-display text-screen font-extrabold">
            {t(reconfirmation ? "reconfirmationTitle" : "liveTitle")}
          </h2>
          <p className="text-body font-bold">
            {t(reconfirmation ? "answersBy" : "closesWhen", { when: when(close) })}
          </p>
          <p className="text-table text-night-300">
            {auction.pausedUntil ? t("phasePaused", { when: resumes ?? "" }) : t("phaseWorking")}
          </p>
          {auction.invitedAgencies !== undefined ? (
            <p className="text-table text-night-300">
              {t("invitedAgencies", { count: auction.invitedAgencies })}
            </p>
          ) : null}
          {reconfirmation ? (
            <p className="text-table text-night-300">{t("reconfirmationIntro")}</p>
          ) : null}
        </div>
      </section>

      <section className="flex flex-col gap-3 rounded-2xl bg-white p-4 shadow-[inset_0_0_0_1px_var(--color-warm-200)] lg:p-6">
        <div className="flex items-baseline justify-between gap-3">
          <h3 className="text-section font-bold">{t(reconfirmation ? "answers" : "envelopes")}</h3>
          <span className="font-display text-price font-extrabold tabular" aria-hidden>
            {count}
          </span>
        </div>
        <p className="sr-only">{t("envelopesCount", { count })}</p>
        {count === 0 ? (
          <div className="flex items-center gap-3">
            <span
              aria-hidden
              className="inline-flex size-11 items-center justify-center rounded-xl border-2 border-dashed border-warm-400 text-warm-600"
            >
              <Icon name="envelope" size={26} />
            </span>
            <span className="text-table">{t("noEnvelopesYet", { when: when(close) })}</span>
          </div>
        ) : (
          <SealedEnvelopes
            count={count}
            seenKey={`astax_envelopes_${requestId}_${auction.round}`}
          />
        )}
        <p className="flex items-center gap-2 text-table text-warm-600">
          <Icon name="lock" size={16} />
          {t("sealedNote")}
        </p>
      </section>

      <section className="flex flex-col gap-3 rounded-2xl bg-white p-4 shadow-[inset_0_0_0_1px_var(--color-warm-200)] lg:p-6">
        <h3 className="text-section font-bold">{t("diaryTitle")}</h3>
        <ol className="flex flex-col">
          {diary.map((d, i) => (
            <li key={`${d.at}-${i}`} className="flex gap-3 py-2">
              <span className="w-20 shrink-0 text-table text-warm-600 tabular">{stamp(d.at)}</span>
              <span aria-hidden className="relative mt-1.5 inline-flex size-2.5 shrink-0">
                {i === 0 ? (
                  <span className="live-ring absolute inset-0 rounded-full bg-orange-700" />
                ) : null}
                <span
                  className={`relative inline-flex size-2.5 rounded-full ${i === 0 ? "bg-orange-700" : "bg-warm-400"}`}
                />
              </span>
              <span className="text-table">{d.text}</span>
            </li>
          ))}
        </ol>
      </section>

      {!reconfirmation ? (
        <section className="flex flex-col gap-3 rounded-2xl bg-white p-4 shadow-[inset_0_0_0_1px_var(--color-warm-200)] lg:p-6">
          <h3 className="text-section font-bold">{t("atClosingTitle")}</h3>
          <p className="text-table">{t("atClosingText")}</p>
          {isPrivate ? (
            <PushSwitch
              publicKey={process.env.VAPID_PUBLIC_KEY ?? ""}
              texts={{
                title: tp("title"),
                intro: tp("intro"),
                turnOn: tp("turnOn"),
                turnOff: tp("turnOff"),
                unsupported: tp("unsupported"),
                denied: tp("denied"),
                off: tp("off"),
                on: tp("on"),
                busy: tp("busy"),
                error: tp("error"),
              }}
            />
          ) : null}
          <AddToCalendar
            expiresAt={close}
            uid={`${requestId}-close-${auction.round}`}
            label={t("closingToCalendar")}
            summary={t("calendarSummary")}
            description={t("calendarDescription", { when: when(close) })}
            alarmBefore="PT15M"
          />
        </section>
      ) : null}
    </div>
  );
}
