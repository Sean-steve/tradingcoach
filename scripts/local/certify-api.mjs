// Phase C live local-backend certification. Destructive to its OWN unique fixture
// records only. This script refuses every non-loopback Supabase instance.
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";

const url = process.env.SUPABASE_URL;
const publicKey = process.env.SUPABASE_PUBLISHABLE_KEY;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !publicKey || !serviceKey) throw Error("Load local .env.local");
const target = new URL(url);
if (!["127.0.0.1","localhost","::1"].includes(target.hostname)) {
  throw Error("CERTIFICATION REFUSES NON-LOCAL DATABASES");
}
const opts = {auth:{persistSession:false,autoRefreshToken:false}};
const client = () => createClient(url,publicKey,opts);
const admin = createClient(url,serviceKey,opts);
const a = client(), b = client();
const runId = randomUUID().slice(0,12);
const expectOk = (res, label) => {
  if (res.error) throw Error(label + ": " + res.error.message);
  return res.data;
};
const deny = (response, label) => assert.ok(response.error, label + " must be denied");
const approx = (actual,expected,label) =>
  assert.ok(Math.abs(Number(actual)-expected)<0.011,label + ": expected "+expected+", received "+actual);
let checks = 0;
const pass = label => {checks++;console.log("PASS "+String(checks).padStart(2,"0")+" "+label);};
async function signed(db,name) {
  const {data,error} = await db.auth.signUp({
    email:`phase-c-${runId}-${name}@example.test`,
    password:"PhaseCLocal-" + randomUUID() + "!z"
  });
  if(error || !data?.session?.access_token)throw Error("Local email signup failed: "+error?.message);
  return data.user.id;
}
const uidA=await signed(a,"alice");
const uidB=await signed(b,"bob");
const getAccount=async db=>{
  const response=await db.from("accounts").select("*").eq("is_default",true).single();
  return expectOk(response,"Get signup account");
};
const accA=await getAccount(a), accB=await getAccount(b);
assert.equal(accA.user_id,uidA);
assert.notEqual(accA.id,accB.id);
const opening=Number(accA.starting_balance);
pass("signup provisions isolated accounts and profiles");

const date="2026-10-25T09:00:00.000Z";
const spot = expectOk(await a.from("trades").insert({
 user_id:uidA,account_id:accA.id,asset:"EURUSD",direction:"long",
 entered_at:date,exited_at:"2026-10-25T09:05:00.000Z",
 result:"win",pnl:60,fees:0,followed_plan:true
}).select("*").single(),"Insert spot");
approx((await getAccount(a)).current_balance,opening+60,"Spot credit");
pass("spot trade updates ledger exactly once");

expectOk(await a.from("trades").update({pnl:-30,result:"loss"}).eq("id",spot.id),"Correct spot result");
approx((await getAccount(a)).current_balance,opening-30,"Spot correction");
const otherAccount=expectOk(await a.from("accounts").insert({
 user_id:uidA,name:"Phase C Secondary "+runId,account_type:"personal",starting_balance:2000,current_balance:999999
}).select("*").single(),"Create secondary account");
approx(otherAccount.current_balance,2000,"Account starting balance authority");
expectOk(await a.from("trades").update({account_id:otherAccount.id}).eq("id",spot.id),"Move corrected trade");
approx((await getAccount(a)).current_balance,opening,"Old account reversed after move");
const {data:updatedB}=await a.from("accounts").select("current_balance").eq("id",otherAccount.id).single();
approx(updatedB.current_balance,1970,"New account debit");
expectOk(await a.from("trades").delete().eq("id",spot.id),"Delete moved trade");
const {data:recoveredB}=await a.from("accounts").select("current_balance").eq("id",otherAccount.id).single();
approx(recoveredB.current_balance,2000,"Delete reversal");
pass("trade correction, account transfer, deletion, and starting-balance authority");

const enterAt="2026-10-25T10:00:00.000Z", expireAt="2026-10-25T10:05:00.000Z";
const bin=expectOk(await a.from("trades").insert({
 user_id:uidA,account_id:accA.id,asset:"GBPUSD",direction:"long",
 entered_at:enterAt,expires_at:expireAt,
 contract_type:"binary",stake:100,payout_percent:80,binary_outcome:"pending",
 pnl:98765,result:"win",fees:2,followed_plan:true
}).select("*").single(),"Insert pending binary");
assert.equal(bin.result,"open");
approx(bin.pnl,0,"Pending P&L");
approx((await getAccount(a)).current_balance,opening,"Pending should not book");
expectOk(await a.from("trades").update({binary_outcome:"win"}).eq("id",bin.id),"Settle binary win");
approx((await getAccount(a)).current_balance,opening+78,"Net win payout minus fees");
expectOk(await a.from("trades").update({binary_outcome:"loss"}).eq("id",bin.id),"Revise binary loss");
approx((await getAccount(a)).current_balance,opening-102,"Stake loss minus fees");
expectOk(await a.from("trades").update({binary_outcome:"push",refund_amount:100}).eq("id",bin.id),"Push with full refund");
approx((await getAccount(a)).current_balance,opening-2,"Fully refunded push still pays fees");
pass("binary pending → win → loss → push conserves account balance");

deny(await b.from("trades").insert({
 user_id:uidB,account_id:accA.id,asset:"EURUSD",direction:"long",
 entered_at:date,pnl:22,result:"win",
}),"Foreign-account trade");
const foreign=expectOk(await b.from("trades").select("id").eq("id",bin.id),"Foreign read");
assert.equal(foreign.length,0);
deny(await b.rpc("tradeos_import_trades",{p_account:accA.id,p_rows:[]}),"Foreign-account import");
pass("cross-user trade and import isolation enforced");

const raw = {
 import_source:"csv",source_key:"phase-c-"+runId+"-unique-01",
 asset:"USDJPY",direction:"long",entered_at:"2026-10-26T09:00:00Z",exited_at:"2026-10-26T09:05:00Z",
 contract_type:"spot",result:"win",pnl:40,fees:0,session:"london"
};
const bad = {...raw,source_key:"phase-c-"+runId+"-invalid-02",direction:"invalid_enum"};
deny(await a.rpc("tradeos_import_trades",{p_account:accA.id,p_rows:[raw,bad]}),"Atomic import batch");
const absent=expectOk(await a.from("trades").select("id").eq("source_key",raw.source_key),"Check rollback");
assert.equal(absent.length,0);
approx((await getAccount(a)).current_balance,opening-2,"Rollback balance unchanged");
const first=expectOk(await a.rpc("tradeos_import_trades",{p_account:accA.id,p_rows:[raw]}),"First import");
const second=expectOk(await a.rpc("tradeos_import_trades",{p_account:accA.id,p_rows:[raw]}),"Repeated import");
assert.equal(first.inserted,1);assert.equal(second.inserted,0);
assert.equal(second.skipped_duplicates,1);
approx((await getAccount(a)).current_balance,opening+38,"One credited import");
pass("atomic CSV rollback and exactly-once duplicate deduplication");

const {data:queue,error:queueError}=await a.from("intelligence_jobs").select("account_id,revision");
if(queueError)throw queueError;
assert.ok(queue.some(j=>j.account_id===accA.id));
pass("persisted intelligence queue receives trade mutations");

const manual=expectOk(await a.from("tom_versions").insert({
 user_id:uidA,version:1,is_active:true,
 identity:"Local certification: plan before trades and review outcomes",
 markets:["EURUSD","GBPUSD"],
 sessions:["london"],change_reason:"Local certification initial manual"
}).select().single(),"Publish manual");
const tradeWithManual=expectOk(await a.from("trades").insert({
 user_id:uidA,account_id:accA.id,asset:"GBPUSD",direction:"short",
 entered_at:"2026-10-26T10:00:00Z",exited_at:"2026-10-26T10:05:00Z",
 pnl:-10,result:"loss",tom_version_id:manual.id
}).select().single(),"Pin trade manual");
assert.equal(tradeWithManual.tom_version_id,manual.id);
pass("trade audit references an explicit TOM version");

const negativeScore=expectOk(await a.from("decision_scores").insert({
 user_id:uidA,trade_id:tradeWithManual.id,plan_adherence:5,
 entry_quality:4,risk_control:5,patience:4,exit_quality:5,process_score:92,source:"manual"
}).select().single(),"Score losing trade process");
assert.equal(Number(negativeScore.process_score),92);
assert.equal(tradeWithManual.result,"loss");
pass("decision process quality is independent of realized profit");

const insight = expectOk(await admin.from("insights").insert({
 user_id:uidA,account_id:accA.id,
 insight_key:"phase-c-"+runId+"-validated",
 category:"discipline",claim:"Local-only validated certification fixture",
 metric:"behavior_rate",status:"validated",sample_size:60,min_sample:20,
 confidence:90,impact_estimate:-120
}).select().single(),"Create local evidence fixture");
const recommendation=expectOk(await admin.from("recommendations").insert({
 user_id:uidA,account_id:accA.id,insight_id:insight.id,
 recommendation_key:"phase-c-"+runId+"-pause",
 title:"Pause and review after loss",action:"Use a fixed pause before another entry",
 rationale:"Deterministic LOCAL-only validation fixture",confidence:90,priority:1,
 status:"active",is_current:true
}).select().single(),"Create local recommendation");
deny(await b.rpc("tradeos_recommendation_action",{
 p_recommendation:recommendation.id,p_action:"accept"
}),"Foreign recommendation transition");
deny(await a.from("recommendations").update({status:"completed"}).eq("id",recommendation.id),"Client-side forged recommendation completion");
const accept=expectOk(await a.rpc("tradeos_recommendation_action",{
 p_recommendation:recommendation.id,p_action:"accept",p_note:"I'll test this action"
}),"Accept advice");
assert.equal(accept.status,"accepted");
const activate=expectOk(await a.rpc("tradeos_recommendation_action",{
 p_recommendation:recommendation.id,p_action:"activate",
 p_guardrail:{trigger_type:"always",trigger_config:{},hard_block:false}
}),"Activate guardrail");
assert.ok(activate.intervention_id);
const repeat=expectOk(await a.rpc("tradeos_recommendation_action",{
 p_recommendation:recommendation.id,p_action:"activate",
 p_guardrail:{trigger_type:"always",trigger_config:{},hard_block:false}
}),"Idempotent activation");
assert.equal(repeat.intervention_id,activate.intervention_id);
const ivs=expectOk(await a.from("interventions").select("id").eq("recommendation_id",recommendation.id),"Guardrail count");
assert.equal(ivs.length,1);
const inaccessibleChange=await b.from("interventions").update({status:"succeeded"}).eq("id",ivs[0].id).select("id");
if (inaccessibleChange.error) {
  assert.ok(inaccessibleChange.error);
} else {
  assert.equal(inaccessibleChange.data?.length,0,"RLS must hide foreign guardrails from UPDATE");
}
const actions=expectOk(await a.from("recommendation_actions").select("action").eq("recommendation_id",recommendation.id),"Actions history");
assert.equal(actions.filter(x=>x.action==="activate").length,1);
pass("audited recommendation acceptance and idempotent guardrail activation");

const complete=expectOk(await a.rpc("tradeos_recommendation_action",{
 p_recommendation:recommendation.id,p_action:"complete"
}),"Complete accepted advice");
assert.equal(complete.status,"completed");
deny(await a.rpc("tradeos_recommendation_action",{
 p_recommendation:recommendation.id,p_action:"accept"
}),"No reopening completed advice");
pass("closed recommendation transitions cannot be reopened");

const goal=expectOk(await a.from("goals").insert({
 user_id:uidA,account_id:accA.id,title:"Phase C process goal",
 metric:"trade_count",starting_value:0,target_value:20,target_mode:"absolute",horizon:"monthly"
}).select().single(),"Create goal");
expectOk(await a.from("goal_milestones").insert({
 user_id:uidA,goal_id:goal.id,title:"Five decisions reviewed",target_value:5
}),"Create milestone");
const demo=expectOk(await a.from("accounts").insert({
 user_id:uidA,name:"Phase C demo "+runId,account_type:"demo",starting_balance:1000
}).select().single(),"Create demo account");
const demoReward=expectOk(await a.from("lifestyle_rewards").insert({
 user_id:uidA,account_id:demo.id,title:"Do not fund from demo",
 budget:100,category:"education",currency:"USD"
}).select().single(),"Create demo reward");
deny(await a.rpc("tradeos_reward_event",{
 p_reward:demoReward.id,p_type:"pledge",p_amount:1
}),"Demo reward must not earmark real rewards");
const reward=expectOk(await a.from("lifestyle_rewards").insert({
 user_id:uidA,account_id:accA.id,title:"Phase C learning course",
 budget:50,category:"education",currency:"USD",linked_goal_id:goal.id
}).select().single(),"Create linked reward");
deny(await a.rpc("tradeos_reward_event",{
 p_reward:reward.id,p_type:"pledge",p_amount:9999
}),"Excessive reward allocation");
const pledge=expectOk(await a.rpc("tradeos_reward_event",{
 p_reward:reward.id,p_type:"pledge",p_amount:1
}),"Conservative reward pledge");
assert.equal(pledge.verified,false);
deny(await a.rpc("tradeos_reward_event",{
 p_reward:reward.id,p_type:"reported_transfer",p_amount:2,p_reference:"phase-c-"+runId+"-receipt"
}),"Cannot self-report more transfers than planned");
const reported=expectOk(await a.rpc("tradeos_reward_event",{
 p_reward:reward.id,p_type:"reported_transfer",p_amount:1,p_reference:"phase-c-"+runId+"-receipt"
}),"Self-reported transfer");
assert.equal(reported.verified,false);
deny(await a.rpc("tradeos_report_reward_redemption",{p_reward:reward.id}),"Unearned reward redemption");
const inaccessible=expectOk(await b.from("lifestyle_rewards").select("id").eq("id",reward.id),"Foreign reward read");
assert.equal(inaccessible.length,0);
pass("goals, milestones, demo exclusion, allocation ceiling, self-report and redemption guard");

const ledger=expectOk(await a.from("account_balance_events").select("delta,trade_id").eq("account_id",accA.id),"Ledger audit");
assert.ok(ledger.some(x=>x.trade_id===bin.id));
const readOnly=await a.from("account_balance_events").insert({
 account_id:accA.id,user_id:uidA,delta:100000,change_type:"trade_insert"
});
deny(readOnly,"Cannot forge account financial audit records");
pass("account balance ledger is visible but append-only for clients");

const finalA=await getAccount(a);
const trades=expectOk(await a.from("trades").select("pnl,result").eq("account_id",accA.id),"Final account trades");
const expectedBalance=opening+trades.filter(x=>x.result!=="open").reduce((n,x)=>n+Number(x.pnl),0);
approx(finalA.current_balance,expectedBalance,"End-to-end reconciliation");
pass("final balance reconciles with actual closed records");

console.log("PHASE C LOCAL API CERTIFICATION PASS: "+checks+" workflow gates.");
