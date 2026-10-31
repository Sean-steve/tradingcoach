// Deterministic functional checks against a FRESH local Supabase instance.
// Uses two brand-new local auth users; never run this against production.
import { createClient } from "@supabase/supabase-js";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";

const url = process.env.SUPABASE_URL;
const publicKey = process.env.SUPABASE_PUBLISHABLE_KEY;
if (!url || !publicKey) throw Error("Load .env.local before running the smoke test");
const api = new URL(url);
if (!["localhost","127.0.0.1","::1"].includes(api.hostname)) {
  throw Error("Refusing to create smoke trades outside a localhost Supabase instance");
}
const suffix = randomUUID().slice(0,8);
const mk = () => createClient(url, publicKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const alice = mk(), bob = mk();
const password = `LocalTest!${randomUUID()}z`;
const signUp = async (db,name) => {
  const {data,error}=await db.auth.signUp({email:`tradeos-local-${name}-${suffix}@example.test`,password});
  if(error)throw error;
  assert.ok(data.user,"User registered");
  if(!data.session)throw Error("Local auth should disable email confirmations");
  return data.user.id;
};
const a=await signUp(alice,"a");
const b=await signUp(bob,"b");
assert.notEqual(a,b);

const getAcct = async db => {
  const {data,error}=await db.from("accounts").select("id,starting_balance,current_balance").eq("is_default",true).single();
  if(error)throw error;
  return data;
};
const acct=await getAcct(alice);
const other=await getAcct(bob);
assert.notEqual(acct.id,other.id);
assert.equal(Number(acct.current_balance),Number(acct.starting_balance));

const entered=new Date("2026-10-20T09:00:00Z");
const expires=new Date(entered.getTime()+300000);
const {data:trade,error:insertError}=await alice.from("trades").insert({
  user_id:a,account_id:acct.id,asset:"EURUSD",direction:"long",session:"london",
  entered_at:entered.toISOString(),contract_type:"binary",stake:100,payout_percent:80,
  expires_at:expires.toISOString(),binary_outcome:"win",result:"loss",pnl:12345,fees:0,
}).select("id,pnl,result,duration_seconds").single();
if(insertError)throw insertError;
assert.equal(Number(trade.pnl),80,"Database overrides fabricated P&L");
assert.equal(trade.result,"win");
assert.equal(trade.duration_seconds,300);
let balance=await getAcct(alice);
assert.equal(Number(balance.current_balance),Number(acct.starting_balance)+80);

const {data:badRead,error:readError}=await bob.from("trades").select("id").eq("id",trade.id);
if(readError)throw readError;
assert.equal(badRead.length,0,"Other user cannot read a trade");
const {error:foreignError}=await bob.from("trades").insert({
  user_id:b,account_id:acct.id,asset:"EURUSD",direction:"long",entered_at:entered.toISOString(),
  pnl:1,result:"win"
});
assert.ok(foreignError,"Other user cannot use a foreign account");

const normalized=[{
  import_source:"csv",source_key:"local-smoke-"+suffix+"-unique",asset:"GBPUSD",direction:"long",
  entered_at:"2026-10-21T08:00:00Z",exited_at:"2026-10-21T08:05:00Z",
  stake:50,pnl:40,fees:0,result:"win",contract_type:"spot",session:"london"
}];
const {data:first,error:importError}=await alice.rpc("tradeos_import_trades",{p_account:acct.id,p_rows:normalized});
if(importError)throw importError;
assert.equal(first.inserted,1);
const {data:second,error:duplicateError}=await alice.rpc("tradeos_import_trades",{p_account:acct.id,p_rows:normalized});
if(duplicateError)throw duplicateError;
assert.equal(second.inserted,0);
assert.equal(second.skipped_duplicates,1);
balance=await getAcct(alice);
assert.equal(Number(balance.current_balance),Number(acct.starting_balance)+120,"No duplicate balance increment");

const {data:jobs,error:jobsError}=await alice.from("intelligence_jobs").select("account_id,revision");
if(jobsError)throw jobsError;
assert.ok(jobs.some(j=>j.account_id===acct.id),"Trade events persisted for worker");

const {error:goalError}=await alice.from("goals").insert({
  user_id:a,account_id:acct.id,title:"Local journaling goal",metric:"trade_count",
  target_value:20,starting_value:0,target_mode:"absolute",horizon:"monthly"
});
if(goalError)throw goalError;
const {data:reward,error:rewardError}=await alice.from("lifestyle_rewards").insert({
  user_id:a,account_id:acct.id,title:"Training seminar",category:"education",
  budget:100,currency:"USD",funding_cap_pct:5,
  min_closed_trades:20,min_plan_adherence_pct:80
}).select("id").single();
if(rewardError)throw rewardError;
const {data:pledge,error:pledgeError}=await alice.rpc("tradeos_reward_event",{
  p_reward:reward.id,p_type:"pledge",p_amount:2
});
if(pledgeError)throw pledgeError;
assert.equal(pledge.verified,false);
const {error:redemptionError}=await alice.rpc("tradeos_report_reward_redemption",{p_reward:reward.id});
assert.ok(redemptionError,"Cannot redeem without real process evidence and declared funding");
const {data:leak,error:leakError}=await bob.from("lifestyle_rewards").select("id").eq("id",reward.id);
if(leakError)throw leakError;
assert.equal(leak.length,0,"Rewards remain user isolated");

console.log("LOCAL SUPABASE SMOKE PASS: Auth, RLS, settled P&L, balance ledger, imports, queue, goals, rewards.");
