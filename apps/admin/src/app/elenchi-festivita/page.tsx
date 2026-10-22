import { formatDate } from "@astax/shared/format";
import { Button, Card, CardTitle } from "@astax/ui";
import { getTranslations } from "next-intl/server";
import Link from "next/link";
import { notFound } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { api } from "@/lib/auth";
import { requireViewer } from "@/lib/me";
import { addHoliday, confirmYear, removeHoliday, saveListValue } from "./actions";

interface ListValue {
  code: string;
  labelIt: string;
  active: boolean;
  sortOrder: number;
}

interface Holidays {
  year: number;
  holidays: { id: string; date: string; name: string }[];
  missing: { date: string; name: string }[];
}

const DONE = ["list", "holiday", "removed", "confirmed"] as const;
const field = "rounded-lg border border-warm-200 px-2 py-1";

/**
 * «Elenchi e festività» (spec 07): the values of every list with the labels
 * in Italian and Albanian; the national holidays of a year (ASTA-02), with the
 * proposal of the next year, Easter Monday included, to confirm.
 */
export default async function ListsHolidaysPage({
  searchParams,
}: {
  searchParams: Promise<{ elenco?: string; anno?: string; errore?: string; fatto?: string }>;
}) {
  const viewer = await requireViewer();
  const t = await getTranslations("listsHolidays");
  const query = await searchParams;
  // Without a year the API proposes the next one, from its clock (rule 6).
  const requested = /^\d{4}$/.test(query.anno ?? "") ? `?year=${query.anno}` : "";
  const [lists, holidays] = await Promise.all([
    api<Record<string, ListValue[]>>("/admin/lists"),
    api<Holidays>(`/admin/holidays${requested}`),
  ]);
  if (lists.status !== 200 || holidays.status !== 200) notFound();
  const year = holidays.body.year;
  const keys = Object.keys(lists.body).sort();
  const selected = keys.find((k) => k === query.elenco);
  const done = DONE.find((d) => d === query.fatto);
  const keep = (
    <>
      <input type="hidden" name="list" value={selected ?? ""} />
      <input type="hidden" name="year" value={year} />
    </>
  );

  return (
    <AppShell viewer={viewer}>
      <h1 className="text-2xl font-bold">{t("title")}</h1>
      <p className="mt-1 text-sm text-warm-600">{t("intro")}</p>
      {query.errore ? (
        <p role="alert" className="mt-4 rounded-lg bg-red-50 p-3 text-sm text-red-700">
          {t("error", { code: query.errore })}
        </p>
      ) : null}
      {done ? (
        <p role="status" className="mt-4 rounded-lg bg-green-50 p-3 text-sm">
          {t(`done.${done}`)}
        </p>
      ) : null}

      <div className="mt-6 grid gap-6 lg:grid-cols-[14rem_1fr]">
        <Card>
          <CardTitle>{t("lists")}</CardTitle>
          <ul className="mt-3 space-y-1 text-sm">
            {keys.map((k) => (
              <li key={k}>
                <Link
                  href={`/elenchi-festivita?elenco=${k}&anno=${year}`}
                  aria-current={k === selected ? "page" : undefined}
                  className={k === selected ? "font-semibold underline" : "underline"}
                >
                  {k}
                </Link>
              </li>
            ))}
          </ul>
        </Card>
        <Card>
          {selected ? (
            <>
              <CardTitle>{selected}</CardTitle>
              <p className="mt-1 text-sm text-warm-600">{t("listHint")}</p>
              <div className="mt-3 space-y-3">
                {(lists.body[selected] ?? []).map((v) => (
                  <form
                    key={v.code}
                    action={saveListValue}
                    className="grid items-end gap-2 border-b border-warm-200 pb-3 text-sm md:grid-cols-[8rem_1fr_5rem_auto]"
                  >
                    {keep}
                    <input type="hidden" name="code" value={v.code} />
                    <span className="font-mono text-xs">{v.code}</span>
                    <label className="grid gap-1">
                      {t("labelIt")}
                      <input name="labelIt" required defaultValue={v.labelIt} className={field} />
                    </label>
                    <label className="grid gap-1">
                      {t("order")}
                      <input
                        name="sortOrder"
                        type="number"
                        min={0}
                        defaultValue={v.sortOrder}
                        className={field}
                      />
                    </label>
                    <label className="flex items-center gap-2">
                      <input type="checkbox" name="active" defaultChecked={v.active} />
                      {t("active")}
                    </label>
                    <label className="grid gap-1 md:col-span-4">
                      {t("reason")}
                      <input name="reason" required minLength={3} className={field} />
                    </label>
                    <Button type="submit" size="sm" variant="outline">
                      {t("save")}
                    </Button>
                  </form>
                ))}
                <form
                  action={saveListValue}
                  className="grid items-end gap-2 text-sm md:grid-cols-[8rem_1fr_1fr_5rem]"
                >
                  {keep}
                  <input type="hidden" name="create" value="1" />
                  <input type="hidden" name="active" value="on" />
                  <label className="grid gap-1">
                    {t("code")}
                    <input name="code" required pattern="[A-Z][A-Z0-9_]*" className={field} />
                  </label>
                  <label className="grid gap-1">
                    {t("labelIt")}
                    <input name="labelIt" required className={field} />
                  </label>
                  <label className="grid gap-1">
                    {t("order")}
                    <input
                      name="sortOrder"
                      type="number"
                      min={0}
                      defaultValue={100}
                      className={field}
                    />
                  </label>
                  <label className="grid gap-1 md:col-span-3">
                    {t("reason")}
                    <input name="reason" required minLength={3} className={field} />
                  </label>
                  <Button type="submit" size="sm">
                    {t("addValue")}
                  </Button>
                </form>
              </div>
            </>
          ) : (
            <p className="text-sm text-warm-600">{t("chooseList")}</p>
          )}
        </Card>
      </div>

      <h2 className="mt-10 text-xl font-semibold">{t("holidays", { year })}</h2>
      <p className="mt-1 text-sm">
        <Link href={`/elenchi-festivita?anno=${year - 1}`} className="underline">
          {t("previousYear")}
        </Link>{" "}
        ·{" "}
        <Link href={`/elenchi-festivita?anno=${year + 1}`} className="underline">
          {t("nextYear")}
        </Link>
      </p>
      <div className="mt-3 grid gap-6 md:grid-cols-2">
        <Card>
          <CardTitle>{t("inCalendar")}</CardTitle>
          {holidays.body.holidays.length === 0 ? (
            <p className="mt-2 text-sm text-warm-600">{t("noHolidays")}</p>
          ) : (
            <ul className="mt-2 space-y-2 text-sm">
              {holidays.body.holidays.map((hd) => (
                <li key={hd.id}>
                  <details>
                    <summary className="cursor-pointer">
                      {formatDate(hd.date)} · {hd.name}
                    </summary>
                    <form action={removeHoliday} className="mt-2 flex flex-wrap items-end gap-2">
                      {keep}
                      <input type="hidden" name="id" value={hd.id} />
                      <label className="grid gap-1">
                        {t("reason")}
                        <input name="reason" required minLength={3} className={field} />
                      </label>
                      <Button type="submit" size="sm" variant="outline">
                        {t("remove")}
                      </Button>
                    </form>
                  </details>
                </li>
              ))}
            </ul>
          )}
        </Card>
        <Card>
          <CardTitle>{t("proposal")}</CardTitle>
          {holidays.body.missing.length === 0 ? (
            <p className="mt-2 text-sm text-warm-600">{t("nothingMissing")}</p>
          ) : (
            <>
              <p className="mt-1 text-sm text-warm-600">{t("proposalHint")}</p>
              <ul className="mt-2 space-y-1 text-sm">
                {holidays.body.missing.map((m) => (
                  <li key={m.date}>
                    {formatDate(m.date)} · {m.name}
                  </li>
                ))}
              </ul>
              <form action={confirmYear} className="mt-3 flex flex-wrap items-end gap-2 text-sm">
                {keep}
                <label className="grid gap-1">
                  {t("reason")}
                  <input name="reason" required minLength={3} className={field} />
                </label>
                <Button type="submit" size="sm">
                  {t("confirmYear", { year })}
                </Button>
              </form>
            </>
          )}
          <h3 className="mt-6 font-semibold">{t("addHoliday")}</h3>
          <form action={addHoliday} className="mt-2 grid gap-2 text-sm">
            {keep}
            <label className="grid gap-1">
              {t("date")}
              <input type="date" name="date" required className={field} />
            </label>
            <label className="grid gap-1">
              {t("nameIt")}
              <input name="name" required className={field} />
            </label>
            <label className="grid gap-1">
              {t("reason")}
              <input name="reason" required minLength={3} className={field} />
            </label>
            <Button type="submit" size="sm" variant="outline" className="justify-self-start">
              {t("add")}
            </Button>
          </form>
        </Card>
      </div>
    </AppShell>
  );
}
