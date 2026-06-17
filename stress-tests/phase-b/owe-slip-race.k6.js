import http from "k6/http";
import { check } from "k6";
export const options = { scenarios: { race: { executor: "shared-iterations", vus: 50, iterations: 50, maxDuration: "30s" } } };
const url = `${__ENV.API_URL}/rest/v1/rpc/fulfill_owe_slip`;
const headers = { "Content-Type": "application/json", apikey: __ENV.SERVICE_KEY, Authorization: `Bearer ${__ENV.SERVICE_KEY}` };
export default function () {
  const res = http.post(url, JSON.stringify({ _slip_id: __ENV.SLIP_ID, _qty: 1 }), { headers });
  check(res, { "1 winner": (r) => r.status === 200 || /SLIP_CLOSED|OVER_FULFILL/.test(r.body) });
}
