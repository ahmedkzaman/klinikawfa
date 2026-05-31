// k6 run -e API_URL=... -e SERVICE_KEY=... -e QUEUE_ID=... -e CONSULTATION_ID=... checkout-race.k6.js
import http from "k6/http";
import { check } from "k6";

export const options = {
  scenarios: {
    race: { executor: "shared-iterations", vus: 50, iterations: 50, maxDuration: "30s" },
  },
};

const url = `${__ENV.API_URL}/rest/v1/rpc/checkout_visit`;
const headers = {
  "Content-Type": "application/json",
  apikey: __ENV.SERVICE_KEY,
  Authorization: `Bearer ${__ENV.SERVICE_KEY}`,
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
