// Concurrent direct UPDATE on queue_entries.clinic_status via PostgREST PATCH.
import http from "k6/http";
import { check } from "k6";
export const options = { scenarios: { race: { executor: "shared-iterations", vus: 50, iterations: 50, maxDuration: "30s" } }, thresholds: { checks: ["rate==1"] } };
const url = `${__ENV.API_URL}/rest/v1/queue_entries?id=eq.${__ENV.QUEUE_ID}`;
const headers = {
  "Content-Type": "application/json",
  apikey: __ENV.ANON_KEY,
  Authorization: `Bearer ${__ENV.AUTH_TOKEN}`,
  Prefer: "return=representation",
};
export default function () {
  const res = http.patch(url, JSON.stringify({ clinic_status: "with_doctor" }), { headers });
  check(res, {
    "queue mutation returned the target row": (r) => {
      if (r.status < 200 || r.status >= 300) return false;
      try {
        const rows = JSON.parse(r.body);
        return Array.isArray(rows)
          && rows.length === 1
          && rows[0].id === __ENV.QUEUE_ID
          && rows[0].clinic_status === "with_doctor";
      } catch {
        return false;
      }
    },
  });
}
