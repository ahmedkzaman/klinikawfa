import http from "k6/http";
import { check } from "k6";
export const options = { scenarios: { race: { executor: "shared-iterations", vus: 50, iterations: 50, maxDuration: "30s" } } };
const url = `${__ENV.API_URL}/rest/v1/rpc/settle_multiple_debts`;
const headers = { "Content-Type": "application/json", apikey: __ENV.SERVICE_KEY, Authorization: `Bearer ${__ENV.SERVICE_KEY}` };
export default function () {
  const res = http.post(url, JSON.stringify({
    p_queue_entry_id: __ENV.QUEUE_ID,
    p_consultation_ids: JSON.parse(__ENV.CONSULTATION_IDS),
    p_amount_paid: Number(__ENV.AMOUNT),
    p_payment_method: "cash",
  }), { headers });
  check(res, { "1 winner": (r) => r.status === 200 || /ALREADY_COMPLETED|OVERPAYMENT/.test(r.body) });
}
