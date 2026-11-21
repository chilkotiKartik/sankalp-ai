// P7.3 load test (k6). Target: 50,000 complaints/day, 500 concurrent officers, SSE fan-out; p95 < 300 ms.
//   k6 run -e BASE=https://staging.example -e CITIZEN_TOKENS=t1,t2 -e DEPT_TOKEN=... -e DEPT=pwd loadtest/k6.js
// 50k/day ≈ 0.6/s on average; we test the peak hour at 10× (6 complaints/s) plus officers polling every 30 s.
import http from "k6/http";
import { check, sleep } from "k6";

const BASE = __ENV.BASE || "http://localhost:5000";
const CITIZENS = (__ENV.CITIZEN_TOKENS || "").split(",").filter(Boolean);
const DEPT = __ENV.DEPT || "pwd";

export const options = {
  scenarios: {
    complaints: { executor: "constant-arrival-rate", rate: 6, timeUnit: "1s", duration: "10m", preAllocatedVUs: 50, exec: "fileComplaint" },
    officers: { executor: "constant-vus", vus: 500, duration: "10m", exec: "officer" },
    public: { executor: "constant-arrival-rate", rate: 20, timeUnit: "1s", duration: "10m", preAllocatedVUs: 40, exec: "publicPages" },
  },
  thresholds: { "http_req_duration{kind:api}": ["p(95)<300"], http_req_failed: ["rate<0.01"] },
};

export function fileComplaint() {
  const tok = CITIZENS[Math.floor(Math.random() * CITIZENS.length)];
  const lat = 30.2 + Math.random() * 0.3, lng = 77.9 + Math.random() * 0.3;
  const r = http.post(`${BASE}/api/complaints`, JSON.stringify({ category: "pothole", description: `Load test pothole ${__VU}-${__ITER}`, location: "Load test road", geo: { lat, lng }, clientRequestId: `k6${__VU}x${__ITER}xxxxxx` }),
    { headers: { "Content-Type": "application/json", Authorization: `Bearer ${tok}` }, tags: { kind: "api" } });
  check(r, { "created or deduplicated": x => x.status === 201 || x.status === 200 });
}

export function officer() {
  const r = http.get(`${BASE}/api/dept/${DEPT}/complaints`, { headers: { Authorization: `Bearer ${__ENV.DEPT_TOKEN}` }, tags: { kind: "api" } });
  check(r, { "list ok": x => x.status === 200 });
  sleep(30);
}

export function publicPages() {
  const r = http.get(`${BASE}/api/public/resolution-rate`, { tags: { kind: "api" } });
  check(r, { "public ok": x => x.status === 200 });
}
