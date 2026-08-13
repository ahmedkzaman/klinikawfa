// k6 run -e API_URL=... -e ANON_KEY=... -e AUTH_TOKEN=... checkout-race.k6.js
import http from "k6/http";
import { check } from "k6";

export const options = {
  scenarios: {
    race: { executor: "shared-iterations", vus: 50, iterations: 50, maxDuration: "30s" },
  },
  thresholds: { checks: ["rate==1"] },
};

const url = `${__ENV.API_URL}/rest/v1/rpc/checkout_visit`;
const headers = {
  "Content-Type": "application/json",
  apikey: __ENV.ANON_KEY,
  Authorization: `Bearer ${__ENV.AUTH_TOKEN}`,
};

export default function () {
  const body = JSON.stringify({
    p_queue_entry_id: __ENV.QUEUE_ID,
    p_consultation_id: __ENV.CONSULTATION_ID,
    p_total_amount: 50,
    p_amount_paid: 50,
    p_payment_method: "cash",
  });
  const res = http.post(url, body, { headers });
  check(res, {
    "200 or ALREADY_COMPLETED": (r) =>
      r.status === 200 || (r.status >= 400 && /ALREADY_COMPLETED/.test(r.body)),
  });
}
