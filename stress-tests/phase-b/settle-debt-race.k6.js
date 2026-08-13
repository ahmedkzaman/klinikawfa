import http from "k6/http";
import { check } from "k6";
export const options = {
  scenarios: { race: { executor: "shared-iterations", vus: 50, iterations: 50, maxDuration: "30s" } },
  thresholds: { checks: ["rate==1"], http_req_failed: ["rate==0"] },
};
const url = `${__ENV.API_URL}/rest/v1/rpc/settle_multiple_debts`;
const headers = { "Content-Type": "application/json", apikey: __ENV.ANON_KEY, Authorization: `Bearer ${__ENV.AUTH_TOKEN}` };
const supportedRpcError = /STALE_PATIENT_OUTSTANDING|INVALID_PAYMENT_ONLY_STATUS|IDEMPOTENCY_KEY_CONFLICT/;
export default function () {
  const res = http.post(url, JSON.stringify({
    p_queue_entry_id: __ENV.QUEUE_ID,
    p_consultation_ids: JSON.parse(__ENV.CONSULTATION_IDS),
    p_amount_paid: Number(__ENV.AMOUNT),
    p_payment_method: "cash",
    p_notes: "K6 keyed debt replay",
    p_idempotency_key: __ENV.IDEMPOTENCY_KEY,
  }), { headers });
  check(res, {
    "same keyed request replays successfully": (r) => r.status === 200,
    "failure uses the supported RPC contract": (r) => r.status === 200 || supportedRpcError.test(r.body),
    "result retains batch correlation": (r) => {
      if (r.status !== 200) return false;
      try {
        const result = r.json();
        return typeof result.batch_id === "string" && Array.isArray(result.payment_ids);
      } catch (_) {
        return false;
      }
    },
  });
}
