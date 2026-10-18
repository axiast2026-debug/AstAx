/**
 * `{{veicolo}}` in the notifications (docs/notifiche.md). Question 15, answer
 * A (Dan, 2026-10-18): the requester and the broker's customer read make,
 * model and plate; the agencies only make and model, the plate is in the app.
 */
interface NotifiedVehicle {
  make: string;
  model: string;
  plate?: string | null;
}

export function vehicleForRequester(vehicle: NotifiedVehicle): string {
  return [vehicle.make, vehicle.model, vehicle.plate ?? ""].join(" ").trim();
}

export function vehicleForAgency(vehicle: NotifiedVehicle): string {
  return `${vehicle.make} ${vehicle.model}`;
}

/**
 * CLA-02, CLA-04: what an agency reads of a published ranking: the first two
 * premiums (anonymous), its own, its position and the gap from the first.
 */
export function rankingVariables(
  entries: readonly { rank: number; annualGrossPremiumCents: number }[],
  own: { rank: number; annualGrossPremiumCents: number },
  format: (cents: number) => string,
) {
  const sorted = [...entries].sort((a, b) => a.rank - b.rank);
  const first = sorted[0];
  const second = sorted[1];
  return {
    premio_primo: first ? format(first.annualGrossPremiumCents) : "",
    premio_secondo: second ? format(second.annualGrossPremiumCents) : "—",
    premio_proprio: format(own.annualGrossPremiumCents),
    scarto: first ? format(own.annualGrossPremiumCents - first.annualGrossPremiumCents) : "",
  };
}
