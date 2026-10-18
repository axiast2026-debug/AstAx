// k6 (phase 8): agency users reading their screens. Criterion: p95 of the API
// under 300 ms at the nominal load (1,000 agency users), no errors.
//   k6 run -e TOKENS_FILE=.state/tokens.json -e VUS=1000 -e DURATION=10m agency-reads.js
import { check, group, sleep } from "k6";
import http from "k6/http";

const API = __ENV.API_URL || "http://127.0.0.1:4000";
const users = JSON.parse(open(__ENV.TOKENS_FILE));

export const options = {
  scenarios: {
    agencies: {
      executor: "ramping-vus",
      startVUs: 0,
      stages: [
        { duration: "1m", target: Number(__ENV.VUS || 1000) },
        { duration: __ENV.DURATION || "10m", target: Number(__ENV.VUS || 1000) },
        { duration: "30s", target: 0 },
      ],
    },
  },
  thresholds: {
    http_req_failed: ["rate==0"],
    http_req_duration: ["p(95)<300"],
  },
};

export default function () {
  const user = users[__VU % users.length];
  const params = {
    headers: { authorization: `Bearer ${user.token}`, "x-astax-context": user.context },
  };
  group("dashboard", () => {
    check(http.get(`${API}/agency/dashboard`, params), { 200: (r) => r.status === 200 });
  });
  group("incoming requests", () => {
    check(http.get(`${API}/agency/requests`, params), { 200: (r) => r.status === 200 });
  });
  group("my offers", () => {
    check(http.get(`${API}/agency/offers`, params), { 200: (r) => r.status === 200 });
  });
  group("notifications", () => {
    check(http.get(`${API}/me/notifications`, params), { 200: (r) => r.status === 200 });
  });
  // A person reads before the next click.
  sleep(2 + Math.random() * 6);
}
