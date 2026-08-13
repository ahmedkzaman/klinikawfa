// Concurrent fefo commits against the same low-stock item.
import http from "k6/http";
import { check } from "k6";
export const options = { scenarios: { race: { executor: "shared-iterations", vus: 50, iterations: 50, maxDuration: "30s" } }, thresholds: { checks: ["rate==1"] } };
const url = `${__ENV.API_URL}/rest/v1/rpc/commit_inventory_fefo`;
const headers = { "Content-Type": "application/json", apikey: __ENV.ANON_KEY, Authorization: `Bearer ${__ENV.AUTH_TOKEN}` };
export default function () {
  const res = http.post(url, JSON.stringify({ _item_id: __ENV.ITEM_ID, _qty: 1 }), { headers });
  check(res, {
    "FEFO RPC exists and returns one mutation result": (r) => {
      if (r.status !== 200 || /PGRST202|PGRST203|function[^\n]*not found/i.test(r.body)) return false;
      try {
        const body = JSON.parse(r.body);
        return Number.isInteger(body.dispensed)
          && Number.isInteger(body.shortfall)
          && body.dispensed + body.shortfall === 1;
      } catch {
        return false;
      }
    },
  });
}
