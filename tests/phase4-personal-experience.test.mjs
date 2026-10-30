import test from "node:test";
import assert from "node:assert/strict";
import { planGoal, planNotice, remainingTradingDays, realizedSessionPnl, milestoneReached, todayInZone } from "../src/lib/goal-planning.ts";
import { rewardProgress, planningAllowance } from "../src/lib/reward-planning.ts";

test("planning days include today and honor selected weekdays", () => {
  assert.equal(remainingTradingDays("2026-10-30","2026-11-03"),3); // Friday + Monday + Tuesday
  assert.equal(remainingTradingDays("2026-10-31","2026-11-01"),0);
  assert.equal(remainingTradingDays("2026-10-31","2026-11-01",[0,6]),2);
  assert.equal(remainingTradingDays("2026-11-03","2026-11-01"),0);
  assert.throws(() => remainingTradingDays("2026-02-30","2026-03-01"));
});

test("incremental goal starts from account baseline, legacy absolute stays absolute", () => {
  const info = { currentValue: 1200, today:"2026-10-30", history:{sessions:25,mean:100} };
  const incremental=planGoal({...info,goal:{metric:"pnl",target_value:500,starting_value:1000,target_mode:"incremental",deadline:"2026-11-03"}});
  assert.equal(incremental.target,1500);
  assert.equal(incremental.remaining,300);
  assert.equal(incremental.requiredPerDay,100);
  assert.equal(incremental.requiredPerWeek,500);
  const legacy=planGoal({...info,goal:{metric:"pnl",target_value:500,starting_value:1000,target_mode:"absolute",deadline:"2026-11-03"}});
  assert.equal(legacy.target,500);
  assert.equal(legacy.achieved,true);
});

test("risk-safe feasibility never recommends stake increases", () => {
  const x=planGoal({
    goal:{metric:"pnl",starting_value:0,target_value:10000,deadline:"2026-11-02"},
    currentValue:-200,today:"2026-10-31",history:{sessions:40,mean:-30}
  });
  assert.equal(x.feasibility,"above_historical_pace");
  assert.match(planNotice(x),/never increase risk/);
  assert.equal(x.remaining,10200);
  assert.equal(x.requiredPerDay,10200);
});

test("expired goals and nonfinancial goals never create compulsory cash quotas", () => {
  const expired=planGoal({goal:{metric:"pnl",starting_value:0,target_value:200,deadline:"2026-10-01"},currentValue:100,today:"2026-10-31"});
  assert.equal(expired.daysLeft,0);
  assert.equal(expired.requiredPerDay,null);
  assert.equal(expired.feasibility,"expired");
  const process=planGoal({goal:{metric:"discipline_score",starting_value:70,target_value:90,deadline:"2026-11-10"},currentValue:80,today:"2026-10-31"});
  assert.equal(process.requiredPerDay,null);
  assert.equal(process.requiredPerWeek,null);
});

test("historical session P&L excludes open trades and counts active settlement dates", () => {
  const h=realizedSessionPnl([
    {pnl:80,result:"win",exited_at:"2026-10-01T06:00:00Z"},
    {pnl:-40,result:"loss",exited_at:"2026-10-01T07:00:00Z"},
    {pnl:1000,result:"open",exited_at:null},
    {pnl:10,result:"win",exited_at:"2026-10-02T07:00:00Z"}
  ]);
  assert.deepEqual(h,{sessions:2,mean:25,total:50});
});

test("timezone planning day uses account profile timezone explicitly", () => {
  assert.equal(todayInZone("Africa/Nairobi",new Date("2026-10-30T22:30:00Z")),"2026-10-31");
  assert.equal(todayInZone("UTC",new Date("2026-10-30T22:30:00Z")),"2026-10-30");
});

test("milestones and drawdown threshold use correct comparator", () => {
  assert.equal(milestoneReached("discipline_score",85,80),true);
  assert.equal(milestoneReached("max_drawdown_pct",6,5),false);
  assert.equal(milestoneReached("max_drawdown_pct",4,5),true);
});

test("reward progress distinguishes pledges, self-reports, and independently verified money", () => {
  const reward={id:"a",budget:200,funding_cap_pct:5,min_closed_trades:20,min_plan_adherence_pct:80};
  const events=[
    {reward_id:"a",event_type:"pledge",amount:200},
    {reward_id:"a",event_type:"reported_transfer",amount:160},
    {reward_id:"b",event_type:"pledge",amount:400},
  ];
  const trades=Array.from({length:20},(_,i)=>({result:"win",followed_plan:i<17}));
  const p=rewardProgress(reward,events,trades);
  assert.equal(p.planned,200);
  assert.equal(p.selfReported,160);
  assert.equal(p.verifiedFunding,0);
  assert.equal(p.processEligible,true);
  assert.equal(p.maySelfReportRedemption,false);
  assert.equal(p.reportedCoverage,80);
});

test("reward process gate refuses sparse trades and unknown adherence", () => {
  const reward={id:"a",budget:100,funding_cap_pct:5,min_closed_trades:20,min_plan_adherence_pct:80};
  const entries=[{reward_id:"a",event_type:"reported_transfer",amount:100}];
  const trades=Array.from({length:40},()=>({result:"loss",followed_plan:null}));
  const p=rewardProgress(reward,entries,trades);
  assert.equal(p.processEligible,false);
  assert.equal(p.maySelfReportRedemption,false);
  assert.equal(p.adherence,0);
});

test("conservative reward planning limits total allocation and never spends unverified funds", () => {
  const allowance=planningAllowance({
    realizedNetPnl:1000,reservedTaxAndCapital:200,allocatedToAllRewards:70,
    rewardPledged:50,rewardBudget:500,rewardCapPct:5,
  });
  assert.equal(allowance,0); // cap = 5% of 800 = 40, already pledged 50
  const reserve=planningAllowance({
    realizedNetPnl:-500,reservedTaxAndCapital:0,allocatedToAllRewards:0,
    rewardPledged:0,rewardBudget:300,rewardCapPct:5,
  });
  assert.equal(reserve,0);
});
