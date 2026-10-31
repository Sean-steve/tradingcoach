// Phase F.1: real PostgreSQL/RLS/cash verification. STRICTLY LOOPBACK ONLY.
// Creates only unique local fixture users and data. Refuses all remote endpoints.
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";

const raw = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_PUBLISHABLE_KEY;
const secret = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!raw || !key || !secret) throw Error("Missing local environment credentials");
const target = new URL(raw);
if (!["127.0.0.1","localhost","::1"].includes(target.hostname)) {
  throw Error("Phase F.1 certification REFUSES NON-LOCAL DATABASE");
}
const opts = { auth: { persistSession: false, autoRefreshToken: false } };
const signed = () => createClient(raw,key,opts);
const privileged = createClient(raw,secret,opts);
const a = signed(), b = signed();
const token = randomUUID().slice(0,8);
async function signIn(client, label) {
  const {data,error} = await client.auth.signUp({
    email:"phase-f1-"+label+"-"+token+"@example.test",
    password:"PhaseF1Local-"+randomUUID()+"!"
  });
  if (error || !data?.session?.access_token) throw Error("Local sign up unavailable: "+error?.message);
  return data.user.id;
}
function ok(response, description) {
  if (response.error) throw Error(description+": "+response.error.message);
  return response.data;
}
function rejected(response, description) {
  assert.ok(response.error, description+" must fail");
}
const cents = (n) => Math.round(Number(n)*100);
let checks = 0;
const pass = (description) => console.log("PASS "+(++checks)+" "+description);
const uidA = await signIn(a,"a"), uidB = await signIn(b,"b");
const accA = ok(await a.from("accounts").select("*").eq("is_default",true).single(),"Get own default account");
const accB = ok(await b.from("accounts").select("*").eq("is_default",true).single(),"Get second default account");
assert.equal(accA.currency,"USD");
assert.ok(accA.currency_confirmed_at,"New accounts must explicitly mark chosen currency");
assert.equal(accB.user_id,uidB);
pass("new accounts have confirmed currency, isolated users");

const idempotency = randomUUID();
const cash={p_account:accA.id,p_kind:"deposit",p_amount:120.25,p_idempotency_key:idempotency,p_reference:"local-cert"};
const first = ok(await a.rpc("tradeos_record_cash_movement",cash),"Record deposit");
const duplicate = ok(await a.rpc("tradeos_record_cash_movement",cash),"Replay deposit");
assert.equal(first.duplicate,false);
assert.equal(duplicate.duplicate,true);
assert.equal(first.id,duplicate.id);
rejected(await a.rpc("tradeos_record_cash_movement",{...cash,p_amount:120.24}),"Idempotency conflict");
rejected(await b.rpc("tradeos_record_cash_movement",{...cash,p_idempotency_key:randomUUID()}),"Foreign account cash mutation");
rejected(await a.from("account_cash_movements").insert({
  account_id:accA.id,user_id:uidA,kind:"deposit",amount:999,currency:"USD",idempotency_key:randomUUID()
}),"Direct unprivileged ledger write");
let account=ok(await a.from("accounts").select("current_balance").eq("id",accA.id).single(),"Read booked cash");
assert.equal(cents(account.current_balance),cents(accA.current_balance)+12025);
pass("cash deposit once, idempotency, RLS & direct write denial");

rejected(await a.rpc("tradeos_record_cash_movement",{
  p_account:accA.id,p_kind:"withdrawal",p_amount:100000000,p_idempotency_key:randomUUID()
}),"Overdraft withdrawal");
const withdrawal=ok(await a.rpc("tradeos_record_cash_movement",{
  p_account:accA.id,p_kind:"withdrawal",p_amount:20.25,p_idempotency_key:randomUUID()
}),"Record withdrawal");
const ledger=ok(await a.from("account_cash_movements").select("*").eq("account_id",accA.id),"Get cash history");
assert.equal(ledger.length,2);
assert.equal(ledger.find(row=>row.id===withdrawal.id).kind,"withdrawal");
const foreign=ok(await b.from("account_cash_movements").select("id").eq("account_id",accA.id),"Foreign cash read");
assert.equal(foreign.length,0);
rejected(await a.from("account_cash_movements").update({amount:300}).eq("id",first.id),"Append-only cash update");
rejected(await a.from("account_cash_movements").delete().eq("id",first.id),"Append-only cash delete");
pass("withdrawals bounded, cash history append-only and tenant isolated");

const trade=ok(await a.from("trades").insert({
  user_id:uidA,account_id:accA.id,asset:"EURUSD",direction:"long",
  entered_at:"2026-10-30T09:00:00Z",exited_at:"2026-10-30T09:05:00Z",
  result:"win",pnl:35
}).select("*").single(),"Insert settled trade");
assert.equal(trade.currency,"USD");
let rows=ok(await a.rpc("tradeos_account_reconciliation"),"Read reconciliation");
let audit=rows.find(row=>row.account_id===accA.id);
assert.equal(audit.status,"balanced");
assert.equal(cents(audit.net_cash),10000);
assert.equal(cents(audit.trade_pnl),3500);
assert.equal(cents(audit.current_balance),cents(accA.current_balance)+13500);
rejected(await a.from("accounts").update({currency:"KES"}).eq("id",accA.id).select(),"Currency immutable after financial activity");
pass("authoritative cash + realized P&L and immutable account currency");

const earmark=ok(await a.from("profit_allocations").insert({
  user_id:uidA,account_id:accA.id,bucket:"reserve",amount:20,note:"local certification earmark"
}).select("*").single(),"Earmark funds");
rejected(await a.from("profit_allocations").insert({
  user_id:uidA,account_id:accA.id,bucket:"tax",amount:25,note:"over allocation"
}),"Over-earmark");
account=ok(await a.from("accounts").select("current_balance").eq("id",accA.id).single(),"Balance unchanged by earmark");
assert.equal(cents(account.current_balance),cents(audit.current_balance));
pass("profit allocation is not a cash withdrawal; overspend guard applied");

const other=ok(await a.from("accounts").insert({
  user_id:uidA,name:"KES local "+token,account_type:"personal",
  currency:"KES",starting_balance:300,current_balance:300,
}).select("*").single(),"Create KES account");
assert.equal(other.currency,"KES");
rejected(await a.from("trades").update({account_id:other.id}).eq("id",trade.id).select(),
  "Cross-currency trade transfer");
rows=ok(await a.rpc("tradeos_account_reconciliation"),"Read multi-currency audit");
assert.equal(rows.find(row=>row.account_id===other.id).status,"balanced");
assert.equal(rows.find(row=>row.account_id===accA.id).currency,"USD");
pass("KES and USD are independent; trade transfer does not invent FX");

const rawImport={
 import_source:"csv", source_key:"phase-f1-"+token+"-trade-key",
 asset:"GBPUSD",direction:"short",entered_at:"2026-10-30T10:00:00Z",
 exited_at:"2026-10-30T10:05:00Z",contract_type:"spot",result:"win",
 pnl:7.25,fees:0,session:"london"
};
const once=ok(await a.rpc("tradeos_import_trades",{p_account:accA.id,p_rows:[rawImport]}),"First CSV import");
const twice=ok(await a.rpc("tradeos_import_trades",{p_account:accA.id,p_rows:[rawImport]}),"Repeated CSV import");
assert.equal(once.inserted,1);assert.equal(twice.inserted,0);
assert.equal(twice.skipped_duplicates,1);
const importRuns=ok(await a.from("trade_import_runs").select("*").eq("account_id",accA.id),"Read logged imports");
assert.equal(importRuns.length,2);
assert.deepEqual(importRuns.map(r=>r.inserted_rows).sort(),[0,1]);
const foreignRuns=ok(await b.from("trade_import_runs").select("id").eq("account_id",accA.id),"Foreign import logs");
assert.equal(foreignRuns.length,0);
pass("import run audit preserves canonical dedupe and ownership");

const balanceEvents=ok(await a.from("account_balance_events").select("change_type,delta,cash_movement_id").eq("account_id",accA.id),"Read event log");
assert.equal(balanceEvents.filter(e=>e.cash_movement_id!==null).length,2);
assert.equal(balanceEvents.filter(e=>e.change_type==="cash_deposit").length,1);
assert.equal(balanceEvents.filter(e=>e.change_type==="cash_withdrawal").length,1);
const finalAudit=ok(await a.rpc("tradeos_account_reconciliation"),"Final account reconciliation")
  .find(row=>row.account_id===accA.id);
assert.equal(finalAudit.status,"balanced");
assert.equal(cents(finalAudit.expected_balance),cents(accA.current_balance)+14225);
pass("cash events trace to movement IDs; final booked balance conserves");

console.log("Phase F.1 full local financial certification PASSED: "+checks+" checks (never touched remote systems)");
