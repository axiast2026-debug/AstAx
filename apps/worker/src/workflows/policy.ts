import { condition, defineSignal, proxyActivities, setHandler } from "@temporalio/workflow";
import { SIGNALS } from "@astax/shared/workflows";
import type { AuctionActivities } from "../activities/types.js";

/**
 * PolicyWorkflow (decision 39): one per policy, id `policy-{requestId}`,
 * started when the policy is issued. The questionnaire after the sale, the
 * renewal notice 30 days before the end, the end of the policy. The schedule
 * is the activity's, read again after each step and whenever the policy
 * changes; only identifiers and instants pass through (BC-07).
 */

/** Development tool (DEV_TOOLS): the next timer fires at once. */
export const policyFireNextTimerSignal = defineSignal(SIGNALS.fireNextTimer);
/** The policy changed (withdrawn, renewal started): read the schedule again. */
export const policyChangedSignal = defineSignal(SIGNALS.policyChanged);

const acts = proxyActivities<AuctionActivities>({
  startToCloseTimeout: "2 minutes",
  retry: { initialInterval: "2 seconds", backoffCoefficient: 2, maximumInterval: "5 minutes" },
});

export async function policyWorkflow(input: { requestId: string }): Promise<string> {
  const { requestId } = input;
  let fire = false;
  let changed = false;
  setHandler(policyFireNextTimerSignal, () => {
    fire = true;
  });
  setHandler(policyChangedSignal, () => {
    changed = true;
  });
  for (;;) {
    changed = false;
    const s = await acts.policySteps({ requestId });
    if (!s.active || !s.nextStepAt) return "CLOSED";
    const ms = Date.parse(s.nextStepAt) - Date.now();
    if (ms > 0) await condition(() => fire || changed, ms);
    if (changed && !fire) continue;
    const forced = fire;
    fire = false;
    await acts.runPolicyStep({ requestId, force: forced });
  }
}
