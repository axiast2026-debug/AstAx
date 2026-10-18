// k6 (phase 8): 50 agencies send their offer in the last minute of the same
// auction. Criterion: every offer accepted (201), no error, and the auction
// still closes within 5 seconds of its time (measure-closings.mjs).
//   k6 run -e OFFERS_FILE=.state/offers.json offers-burst.js
// OFFERS_FILE: [{ token, context, auctionId, offer }] one per agency, `offer`
// being the X-Offer header the web app sends; the PDF is a small sample.
import { check, sleep } from "k6";
import http from "k6/http";

const API = __ENV.API_URL || "http://127.0.0.1:4000";
const offers = JSON.parse(open(__ENV.OFFERS_FILE));
const pdf = open(__ENV.PDF_FILE || "./sample-quote.pdf", "b");

export const options = {
  scenarios: {
    lastMinute: {
      executor: "per-vu-iterations",
      vus: offers.length,
      iterations: 1,
      // All within the same minute, spread over 50 seconds.
      startTime: "0s",
      maxDuration: "2m",
    },
  },
  thresholds: {
    http_req_failed: ["rate==0"],
    checks: ["rate==1"],
  },
};

export default function () {
  const o = offers[__VU - 1];
  // Spread the arrivals over the minute, as real agencies would.
  const wait = Math.random() * 50;
  if (wait > 0) sleep(wait);
  const response = http.post(`${API}/auctions/${o.auctionId}/offers`, pdf, {
    headers: {
      authorization: `Bearer ${o.token}`,
      "x-astax-context": o.context,
      "x-offer": o.offer,
      "content-type": "application/pdf",
    },
  });
  check(response, { "offer accepted": (r) => r.status === 201 });
}
