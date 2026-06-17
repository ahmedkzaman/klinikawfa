// Concurrent direct UPDATE on queue_entries.clinic_status via PostgREST PATCH.
import http from "k6/http";
import { check } from "k6";
export const options = { scenarios: { race: { executor: "shared-iterations", vus: 50, iterations: 50, maxDuration: "30s" } } };
const url = `${__ENV.API_URL}/rest/v1/queue_entries?id=eq.${__ENV.QUEUE_ID}`;
const headers = {
  "Content-Type": "application/json",
  apikey: __ENV.SERVICE_KEY,
  Authorization: `Bearer ${__ENV.SERVICE_KEY}`,
  Prefer: "return=representation",
};
export default function () {
  const res = http.patch(url, JSON.stringify({ clinic_status: "with_doctor" }), { headers });
  check(res, { "2xx": (r) => r.status >= 200 && r.status < 300 });
}
