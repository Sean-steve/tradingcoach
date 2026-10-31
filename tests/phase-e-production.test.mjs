import test from "node:test";
import assert from "node:assert/strict";
import { productionPreflight, preflightSummary } from "../src/lib/production-preflight.ts";
import { verifyWorkerToken, workerLimit, workerQueueSummary, workerIsOverdue, sanitizedWorkerError } from "../src/lib/worker-governance.ts";

const good={
  NODE_ENV:"production",
  SUPABASE_URL:"https://trade-db.example.com",
  VITE_SUPABASE_URL:"https://trade-db.example.com",
  SUPABASE_PUBLISHABLE_KEY:"sb_publishable_public_test_only",
  VITE_SUPABASE_PUBLISHABLE_KEY:"sb_publishable_public_test_only",
  SUPABASE_SERVICE_ROLE_KEY:"sb_secret_opaque_test_only",
  TRADE_OS_CRON_SECRET:"a".repeat(64),
  TRADE_OS_APP_URL:"https://trade.example.com",
  TRADE_OS_RELEASE_SHA:"a".repeat(40),
};

test("Phase E: full HTTPS deployment configuration has no release blockers",()=>{
  assert.deepEqual(preflightSummary(productionPreflight(good)).blockers,[]);
});
test("Phase E: missing or weak service credentials fail closed",()=>{
  const r=preflightSummary(productionPreflight({...good,
    SUPABASE_SERVICE_ROLE_KEY:"",TRADE_OS_CRON_SECRET:"test",NODE_ENV:"development"
  }));
  assert.ok(r.blockers.includes("SUPABASE_SERVICE_ROLE_KEY"));
  assert.ok(r.blockers.includes("TRADE_OS_CRON_SECRET"));
  assert.ok(r.blockers.includes("NODE_ENV"));
});
test("Phase E: plaintext hosted API is forbidden even with private HTTP waiver",()=>{
 const r=preflightSummary(productionPreflight({...good,
   SUPABASE_URL:"http://evil.example.com",TRADE_OS_PRIVATE_DB_HTTP:"yes"
 }));
 assert.ok(r.blockers.includes("SUPABASE_URL"));
 assert.ok(r.blockers.includes("TRADE_OS_PUBLIC_SUPABASE_URL"));
});
test("Phase E: explicit private networking allows internal HTTP but not external public API",()=>{
 const data={...good,TRADE_OS_PRIVATE_DB_HTTP:"yes",SUPABASE_URL:"http://kong:8000",
   TRADE_OS_PUBLIC_SUPABASE_URL:"https://trade-db.example.com"};
 const errors=preflightSummary(productionPreflight(data));
 assert.deepEqual(errors.blockers,[]);
 assert.ok(errors.warnings.includes("TRADE_OS_PRIVATE_DB_HTTP"));
});
test("Phase E: privileged browser key exposures are release blockers",()=>{
 const r=preflightSummary(productionPreflight({...good,VITE_SERVICE_ROLE_KEY:"example-key",
   VITE_SUPABASE_URL:"https://other-db.example.com"}));
 assert.ok(r.blockers.includes("VITE_SERVICE_ROLE_KEY"));
 assert.ok(r.blockers.includes("VITE_SUPABASE_URL"));
});
test("Phase E: identical admin and public keys are not allowed",()=>{
 const r=preflightSummary(productionPreflight({...good,
   SUPABASE_SERVICE_ROLE_KEY:good.SUPABASE_PUBLISHABLE_KEY}));
 assert.ok(r.blockers.includes("SUPABASE_SERVICE_ROLE_KEY"));
});
test("Phase E: optional offline AI is warning, plaintext remote AI is blocker",()=>{
 assert.ok(preflightSummary(productionPreflight(good)).warnings.includes("AI_PROVIDER"));
 assert.ok(preflightSummary(productionPreflight({...good,
   AI_API_BASE_URL:"http://outside.example.org/v1",AI_MODEL:"model"
 })).blockers.includes("AI_PROVIDER"));
});
test("Phase E: bearer verification requires exact strong token",()=>{
 const token="a".repeat(64);
 assert.equal(verifyWorkerToken("Bearer "+token,token),true);
 assert.equal(verifyWorkerToken("bearer "+token,token),true);
 assert.equal(verifyWorkerToken("Bearer "+token+"x",token),false);
 assert.equal(verifyWorkerToken("Bearer "+token+" anything",token),false);
 assert.equal(verifyWorkerToken("Bearer short","short"),false);
 assert.equal(verifyWorkerToken(null,token),false);
});
test("Phase E: max per-invocation worker concurrency is bounded",()=>{
 assert.equal(workerLimit(undefined,4,2),2);
 assert.equal(workerLimit("4",4,2),4);
 for(const value of ["0","5","-1","foo","1.5","999999999999999999999"])
  assert.throws(()=>workerLimit(value,4,2));
});
test("Phase E: queue SLA flags stale leases and overdue pending jobs",()=>{
 const now=Date.parse("2026-10-31T10:00:00.000Z");
 const rows=[
  {status:"pending",next_attempt_at:"2026-10-31T09:00:00Z",locked_at:null},
  {status:"running",locked_at:"2026-10-31T09:00:00Z",next_attempt_at:null},
  {status:"succeeded",locked_at:null,next_attempt_at:null},
  {status:"failed",locked_at:null,next_attempt_at:null},
 ];
 assert.equal(workerIsOverdue(rows[0],now),true);
 assert.deepEqual(workerQueueSummary(rows,now),{pending:1,running:1,succeeded:1,failed:1,overdue:2});
});
test("Phase E: logs cannot contain service keys, JWTs, database passwords or raw IDs",()=>{
 const token="eyJ"+("A".repeat(40))+".eyJ"+("B".repeat(40))+".sig";
 const text="Bearer sometoken "+token+" sb_secret_testing123 postgresql://u:password@private:5432/db "+
   "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee";
 const actual=sanitizedWorkerError(text);
 for(const word of ["sometoken","sb_secret_testing123","password","aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee"])
  assert.ok(!actual.includes(word));
 assert.ok(actual.length<=300);
});
