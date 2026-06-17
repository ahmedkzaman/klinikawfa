// Concurrent fefo commits against the same low-stock item.
import http from "k6/http";
import { check } from "k6";
export const options = { scenarios: { race: { executor: "shared-iterations", vus: 50, iterations: 50, maxDuration: "30s" } } };
const url = `${__ENV.API_URL}/rest/v1/rpc/commit_inventory_fefo`;
const headers = { "Content-Type": "application/json", apikey: __ENV.SERVICE_KEY, Authorization: `Bearer ${__ENV.SERVICE_KEY}` };
export default function () {
  const res = http.post(url, JSON.stringify({ p_item_id: __ENV.ITEM_ID, p_qty: 1 }), { headers });
  check(res, { "no negative stock": (r) => !/negative/i.test(r.body) });
}
