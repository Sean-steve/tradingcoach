// Local-only background automation certification. Never uses production keys.
import assert from "node:assert/strict";
const root=process.env.TRADE_OS_LOCAL_APP_URL||"http://127.0.0.1:8080";
const db=process.env.SUPABASE_URL||"";
const token=process.env.TRADE_OS_CRON_SECRET||"";
for(const raw of [root,db]){
 const u=new URL(raw);
 assert.ok(["localhost","127.0.0.1","::1"].includes(u.hostname),"Refusing remote automation certification");
}
assert.ok(token.length>=32,"Local worker secret not configured");

const url=root+"/api/internal/intelligence";
const denied=await fetch(url,{method:"POST"});
assert.equal(denied.status,401,"Worker cannot be invoked anonymously");
const accepted=await fetch(url,{method:"POST",headers:{
  Authorization:"Bearer "+token,"Content-Type":"application/json"
}});
assert.equal(accepted.status,200,"Worker batch must execute without a failure");
const result=await accepted.json();
assert.ok(Number.isInteger(result.processed),"Worker must return processed count");
assert.equal(result.failed,0,"No pipeline failures permitted");
assert.ok(result.processed>=1,"Local certification expects queued account work");
const health=await fetch(url,{headers:{Authorization:"Bearer "+token}});
assert.equal(health.status,200,"Worker queue must not have failed or stale jobs");
const queue=await health.json();
assert.ok(Number.isInteger(queue.queue.pending));
console.log("PHASE E WORKER CERTIFICATION PASS:",JSON.stringify({
 processed:result.processed,failed:result.failed,
 pending:queue.queue.pending,overdue:queue.queue.overdue
}));
