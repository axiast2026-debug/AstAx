import type { PersonData, QuoteDraft } from "@astax/shared/domain";

/**
 * Codes of editable lists inside a draft must be active values of their list
 * (spec 09 §4: the administrator adds values without changing the code).
 * Returns validation errors with paths and codes, never values.
 */
export function listCodeProblems(
  draft: QuoteDraft,
  active: ReadonlyMap<string, ReadonlySet<string>>,
): { path: string; issue: string }[] {
  const problems: { path: string; issue: string }[] = [];
  const check = (list: string, code: string | undefined, path: string) => {
    if (code !== undefined && !active.get(list)?.has(code))
      problems.push({ path, issue: `NOT_IN_LIST:${list}` });
  };
  const person = (p: PersonData | "SAME_AS_POLICY_HOLDER" | undefined, path: string) => {
    if (!p || p === "SAME_AS_POLICY_HOLDER" || p.kind !== "PERSON") return;
    check("profession", p.profession, `${path}.profession`);
    check("maritalStatus", p.maritalStatus, `${path}.maritalStatus`);
  };
  person(draft.policyHolder, "policyHolder");
  person(draft.vehicleOwner, "vehicleOwner");
  if (draft.vehicle) {
    check("vehicleType", draft.vehicle.type, "vehicle.type");
    check("vehicleUse", draft.vehicle.use, "vehicle.use");
    check("fuel", draft.vehicle.fuel, "vehicle.fuel");
    check("nightParking", draft.vehicle.nightParking, "vehicle.nightParking");
    check("annualKmBand", draft.vehicle.annualKmBand, "vehicle.annualKmBand");
  }
  if (draft.history) check("provenance", draft.history.provenance, "history.provenance");
  draft.driving?.drivers.forEach((d, i) => {
    person(d.person, `driving.drivers.${i}.person`);
    if (d.licence) {
      check("licenceCategory", d.licence.category, `driving.drivers.${i}.licence.category`);
    }
  });
  for (const [i, code] of (draft.specialUses ?? []).entries())
    check("exclusionCase", code, `specialUses.${i}`);
  return problems;
}
