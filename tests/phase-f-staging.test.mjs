import test from "node:test";
import assert from "node:assert/strict";
import { validateDeploymentTarget, verifyDeployment } from "../scripts/ops/staging-smoke.mjs";

const sha = "a".repeat(40);
const config = {
  TRADE_OS_APP_URL: "https://staging.trade-os.test",
  TRADE_OS_EXPECTED_SHA: sha,
  TRADE_OS_EXPECTED_ENV: "staging",
  TRADE_OS_CRON_SECRET: "x".repeat(64),
};
const jsonResponse = (code, data) => new Response(JSON.stringify(data), {status:code, headers:{"content-type":"application/json"}});
function fakeProbes(overrides = {}) {
  const calls = [];
  const fetcher = async (url, options = {}) => {
    const path = new URL(url).pathname;
    const authenticated = !!options.headers?.Authorization;
    const method = options.method || "GET";
    calls.push({path, authenticated, method});
    const key = path + ":" + method + ":" + (authenticated ? "auth" : "anon");
    const defaults = {
      "/api/health:GET:anon": jsonResponse(200, {status:"ok",service:"trade-os",release:sha,environment:"staging"}),
      "/api/ready:GET:anon": jsonResponse(200, {status:"ready",database:"reachable",financial_schema:"phase-f1"}),
      "/api/internal/intelligence:GET:anon": jsonResponse(401, {error:"Unauthorized"}),
      "/api/internal/intelligence:POST:anon": jsonResponse(401, {error:"Unauthorized"}),
      "/api/internal/intelligence:GET:auth": jsonResponse(200, {status:"ok",queue:{pending:0,running:0,succeeded:1,failed:0,overdue:0}}),
    };
    return overrides[key] || defaults[key];
  };
  return {fetcher,calls};
}
test("Phase F: only genuine HTTPS public origins qualify", () => {
  assert.equal(validateDeploymentTarget(config.TRADE_OS_APP_URL),config.TRADE_OS_APP_URL);
  for (const url of ["http://staging.test","https://localhost","https://example.com",
    "https://user:pass@staging.test","https://staging.test/hidden",
    "https://staging.test/?token=a","https://staging.test/#x"]) {
    assert.throws(() => validateDeploymentTarget(url), url);
  }
});
test("Phase F: full read-only staging verification passes", async () => {
  const {fetcher,calls} = fakeProbes();
  const report = await verifyDeployment(config,fetcher);
  assert.equal(report.status,"verified");
  assert.equal(calls.length,5);
  assert.equal(calls.some(call => call.method==="POST" && call.authenticated),false);
});
test("Phase F: wrong release SHA and wrong environment block verification", async () => {
  const {fetcher} = fakeProbes();
  await assert.rejects(verifyDeployment({...config,TRADE_OS_EXPECTED_SHA:"b".repeat(40)},fetcher),/identity/);
  await assert.rejects(verifyDeployment({...config,TRADE_OS_EXPECTED_ENV:"production"},fetcher),/identity/);
  await assert.rejects(verifyDeployment({...config,TRADE_OS_EXPECTED_SHA:"abc"},fetcher),/full 40/);
});
test("Phase F: DB unreadiness blocks certification", async () => {
  const {fetcher} = fakeProbes({"/api/ready:GET:anon":jsonResponse(503,{status:"not_ready"})});
  await assert.rejects(verifyDeployment(config,fetcher),/unexpected HTTP 503/);
});
test("Phase F: public worker access or degraded queue blocks certification", async () => {
  let {fetcher} = fakeProbes({"/api/internal/intelligence:GET:anon":jsonResponse(200,{})});
  await assert.rejects(verifyDeployment(config,fetcher),/unexpected HTTP 200/);
  ({fetcher}=fakeProbes({"/api/internal/intelligence:GET:auth":jsonResponse(503,{status:"degraded"})}));
  await assert.rejects(verifyDeployment(config,fetcher),/unexpected HTTP 503/);
});
test("Phase F: missing worker secret cannot produce false green", async () => {
  const {fetcher} = fakeProbes();
  await assert.rejects(verifyDeployment({...config,TRADE_OS_CRON_SECRET:""},fetcher),/secret/);
});

test("Phase F.2: staging fails closed when financial migrations are absent",async()=>{
  const {fetcher} = fakeProbes({"/api/ready:GET:anon":jsonResponse(200,{status:"ready",database:"reachable"})});
  await assert.rejects(verifyDeployment(config,fetcher),/Database not verified ready/);
});
