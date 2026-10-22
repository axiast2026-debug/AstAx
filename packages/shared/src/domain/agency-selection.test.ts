import { describe, expect, it } from "vitest";
import type { AgencyFilterCriteria, FilterableRequest } from "./agency-filters.js";
import { selectAgencies, type AgencyCandidate, type SelectionInput } from "./agency-selection.js";
import { romeInstant, type WeeklyHours, type WorkingCalendar } from "./working-calendar.js";

const HOURS: WeeklyHours = {
  mon: [["09:00", "19:00"]],
  tue: [["09:00", "19:00"]],
  wed: [["09:00", "19:00"]],
  thu: [["09:00", "19:00"]],
  fri: [["09:00", "19:00"]],
  sat: [["09:00", "13:00"]],
  sun: [],
};
const calendar: WorkingCalendar = { hours: HOURS, holidays: new Set() };
const [ALFA, BETA, GAMMA, DELTA] = [
  "00000000-0000-7000-8000-00000000000a",
  "00000000-0000-7000-8000-00000000000b",
  "00000000-0000-7000-8000-00000000000c",
  "00000000-0000-7000-8000-00000000000d",
];

const criteria = (
  companies: string[],
  vehicleTypes = ["CAR", "MOTORCYCLE"],
): AgencyFilterCriteria => ({
  vehicleTypes: vehicleTypes as [string, ...string[]],
  provinces: null,
  cuClassMin: 1,
  cuClassMax: 18,
  maxClaimsLast5y: null,
  driverAgeMin: 18,
  driverAgeMax: 99,
  packages: ["BASE", "PLUS", "COMPLETE"],
  companies: companies as [string, ...string[]],
  maxStartDateDays: 60,
  maxGuaranteeDays: 30,
});

const agency = (
  id: string,
  companies: string[],
  more: Partial<AgencyCandidate> = {},
): AgencyCandidate => ({
  organizationId: id,
  active: true,
  criteria: criteria(companies),
  distribution: "ALL_USERS",
  memberCriteria: [],
  pausedUntil: null,
  dailyMax: null,
  invitationsToday: 0,
  receptionHours: HOURS,
  mandatedCompanies: companies,
  lastInvitedAt: null,
  ...more,
});

const motorcycle: FilterableRequest = {
  vehicleType: "MOTORCYCLE",
  province: "MI",
  cuClass: 3,
  claimsLast5y: 0,
  youngestDriverAge: 40,
  packageCode: "COMPLETE",
  startInDays: 10,
  minValidityDays: 15,
};

const input = (
  candidates: AgencyCandidate[],
  more: Partial<SelectionInput> = {},
): SelectionInput => ({
  request: motorcycle,
  candidates,
  calendar,
  openedAt: romeInstant("2026-11-19", "17:30"),
  closeAt: romeInstant("2026-11-19", "18:30"),
  minReceptionOverlapMinutes: 60,
  limit: 8,
  alreadyInvited: [],
  excluded: [],
  rotation: true,
  ...more,
});

const ids = (s: { organizationId: string }[]) => s.map((a) => a.organizationId);

describe("selection of the agencies (ASTA-05)", () => {
  it("S04 Nove, paused until 18:15, is not invited at 17:30; Uno, Tre and Quattro are", () => {
    const candidates = [
      agency("uno", [ALFA, BETA]),
      agency("due", [ALFA], { criteria: criteria([ALFA], ["CAR"]) }),
      agency("tre", [BETA, GAMMA]),
      agency("quattro", [GAMMA]),
      agency("nove", [DELTA], { pausedUntil: romeInstant("2026-11-19", "18:15") }),
    ];
    const s = selectAgencies(input(candidates));
    expect(ids(s.selected).sort()).toEqual(["quattro", "tre", "uno"]);
    expect(s.rejected).toContainEqual({ organizationId: "nove", reasons: ["PAUSED"] });
    expect(s.rejected).toContainEqual({ organizationId: "due", reasons: ["VEHICLE_TYPE"] });
  });

  it("S04 ASTA-08 the reopening at 18:30 invites every compatible agency not yet invited: Nove", () => {
    const candidates = [
      agency("uno", [ALFA, BETA]),
      agency("tre", [BETA, GAMMA]),
      agency("quattro", [GAMMA]),
      agency("nove", [DELTA], { pausedUntil: romeInstant("2026-11-19", "18:15") }),
    ];
    const s = selectAgencies(
      input(candidates, {
        openedAt: romeInstant("2026-11-19", "18:30"),
        closeAt: romeInstant("2026-11-20", "10:30"),
        limit: null,
        rotation: false,
        alreadyInvited: [
          { organizationId: "uno", companies: [ALFA, BETA] },
          { organizationId: "tre", companies: [BETA, GAMMA] },
          { organizationId: "quattro", companies: [GAMMA] },
        ],
      }),
    );
    expect(ids(s.selected)).toEqual(["nove"]);
  });

  it("ASTA-04 S04 the top-up at half finds no agency available: Nove is still paused at 18:00", () => {
    const s = selectAgencies(
      input([agency("nove", [DELTA], { pausedUntil: romeInstant("2026-11-19", "18:15") })], {
        openedAt: romeInstant("2026-11-19", "18:00"),
        limit: 4,
      }),
    );
    expect(s.selected).toEqual([]);
  });

  it("ASTA-05 variety of companies first, then rotation: who adds a company comes before who was invited less recently", () => {
    const candidates = [
      agency("a-alfa-old", [ALFA], { lastInvitedAt: new Date("2026-11-01T10:00:00Z") }),
      agency("b-alfa-older", [ALFA], { lastInvitedAt: new Date("2026-10-01T10:00:00Z") }),
      agency("c-beta-recent", [BETA], { lastInvitedAt: new Date("2026-11-18T10:00:00Z") }),
    ];
    const s = selectAgencies(input(candidates, { limit: 2 }));
    expect(ids(s.selected)).toEqual(["b-alfa-older", "c-beta-recent"]);
    expect(s.selected[1]?.newCompanies).toEqual([BETA]);
    expect(s.compatibleNotChosen).toEqual(["a-alfa-old"]);
  });

  it("ASTA-05 rotation: an agency never invited comes before one invited yesterday", () => {
    const candidates = [
      agency("x", [ALFA], { lastInvitedAt: new Date("2026-11-18T10:00:00Z") }),
      agency("y", [ALFA]),
    ];
    expect(ids(selectAgencies(input(candidates, { limit: 1 })).selected)).toEqual(["y"]);
  });

  it("ASTA-04 at most 8 invitations", () => {
    const many = Array.from({ length: 11 }, (_, i) =>
      agency(`ag-${String(i).padStart(2, "0")}`, [ALFA]),
    );
    const s = selectAgencies(input(many));
    expect(s.selected).toHaveLength(8);
    expect(s.compatibleNotChosen).toHaveLength(3);
  });

  it("ASTA-05 suspension, daily capacity, reception hours and maximum guarantee exclude an agency", () => {
    const s = selectAgencies(
      input([
        agency("suspended", [ALFA], { active: false }),
        agency("full", [ALFA], { dailyMax: 5, invitationsToday: 5 }),
        agency("mornings", [ALFA], {
          receptionHours: { ...HOURS, thu: [["09:00", "13:00"]] },
        }),
        agency("short", [ALFA], { criteria: { ...criteria([ALFA]), maxGuaranteeDays: 7 } }),
        agency("room", [ALFA], { dailyMax: 5, invitationsToday: 4 }),
      ]),
    );
    expect(ids(s.selected)).toEqual(["room"]);
    expect(Object.fromEntries(s.rejected.map((r) => [r.organizationId, r.reasons]))).toEqual({
      suspended: ["NOT_ACTIVE"],
      full: ["DAILY_CAPACITY"],
      mornings: ["RECEPTION_HOURS"],
      short: ["GUARANTEE"],
    });
  });

  it("ASTA-05 an agency that distributes by member filters needs one member whose filters fit", () => {
    const byMembers = (memberCriteria: AgencyFilterCriteria[]) =>
      agency("members", [ALFA], { distribution: "BY_MEMBER_FILTERS", memberCriteria });
    expect(selectAgencies(input([byMembers([criteria([ALFA], ["CAR"])])])).rejected).toEqual([
      { organizationId: "members", reasons: ["NO_MEMBER_FILTERS"] },
    ]);
    expect(ids(selectAgencies(input([byMembers([criteria([ALFA])])])).selected)).toEqual([
      "members",
    ]);
  });

  it("OFF-04 an agency offers only with its mandates: a filter company without mandate does not count", () => {
    const s = selectAgencies(input([agency("nomandate", [ALFA], { mandatedCompanies: [] })]));
    expect(s.rejected).toEqual([{ organizationId: "nomandate", reasons: ["NO_COMPANY"] }]);
  });

  it("ADR 0015 answer 3B: at an agency's auction the others offer only with the companies it does not have", () => {
    // The requesting agency has Alfa: an Alfa + Beta agency is invited for Beta only,
    // an Alfa-only agency is not invited.
    const s = selectAgencies(
      input([agency("alfa-beta", [ALFA, BETA]), agency("alfa", [ALFA])], {
        excludedCompanies: [ALFA],
      }),
    );
    expect(s.selected).toEqual([
      { organizationId: "alfa-beta", companies: [BETA], newCompanies: [BETA] },
    ]);
    expect(s.rejected).toEqual([{ organizationId: "alfa", reasons: ["NO_COMPANY"] }]);
  });

  it("ASTA-06 an agency left out by the back office is not invited, nor one already invited", () => {
    const s = selectAgencies(
      input([agency("out", [ALFA]), agency("in", [BETA])], {
        excluded: ["out"],
        alreadyInvited: [{ organizationId: "in", companies: [BETA] }],
      }),
    );
    expect(s.selected).toEqual([]);
    expect(s.rejected).toEqual([
      { organizationId: "out", reasons: ["EXCLUDED_BY_BACK_OFFICE"] },
      { organizationId: "in", reasons: ["ALREADY_INVITED"] },
    ]);
  });
});
