import test from "node:test";
import assert from "node:assert/strict";
import { calculateBinarySettlement, breakevenWinRatePercent, calculateBinaryPerformance, validateBinaryExpiry } from "../src/lib/binary-options.ts";
import { importFingerprint, distinctImportKeys } from "../src/lib/import-integrity.ts";
import { computeMetrics, rollup, bucketMonth } from "../src/lib/metrics.ts";
import { expectedCashBalance, balanceVariance, groupBalancesByCurrency, splitAllocationCents } from "../src/lib/financial-reconciliation.ts";

test("binary WIN: 80% net payout on 100 stake = +80, stake is not revenue",()=>{
  const x=calculateBinarySettlement({stake:100,payoutPercent:80,settlement:"win",fees:0});
  assert.equal(x.pnl,80);assert.equal(x.grossProfit,80);assert.equal(x.result,"win");
  assert.ok(Math.abs(x.breakevenWinRate-55.5555555555)<0.001);
});
test("binary LOSS: full loss, and partial loss rebate reduce stake loss",()=>{
  assert.equal(calculateBinarySettlement({stake:100,payoutPercent:80,settlement:"loss",fees:0}).pnl,-100);
  assert.equal(calculateBinarySettlement({stake:100,payoutPercent:80,settlement:"loss",refundAmount:10,fees:2}).pnl,-92);
});
test("binary PUSH and VOID: refund principal, fee-only cash impact",()=>{
  const push=calculateBinarySettlement({stake:100,payoutPercent:80,settlement:"push",fees:1.25});
  const cancelled=calculateBinarySettlement({stake:100,payoutPercent:80,settlement:"void",fees:0});
  assert.equal(push.refundedPrincipal,100);assert.equal(push.pnl,-1.25);assert.equal(push.result,"breakeven");
  assert.equal(cancelled.pnl,0);assert.equal(cancelled.result,"breakeven");
});
test("binary unsettled contract recognizes no P&L or fees",()=>{
  assert.equal(calculateBinarySettlement({stake:50,payoutPercent:80,settlement:"open",fees:0}).pnl,0);
  assert.throws(()=>calculateBinarySettlement({stake:50,payoutPercent:80,settlement:"open",fees:1}));
});
test("binary cents and percentage math preserve explicit 2-decimal settlement",()=>{
  assert.equal(calculateBinarySettlement({stake:10.01,payoutPercent:81.5,settlement:"win",fees:0.03}).pnl,8.13);
  assert.throws(()=>calculateBinarySettlement({stake:0,payoutPercent:80,settlement:"win",fees:0}));
  assert.throws(()=>calculateBinarySettlement({stake:-1,payoutPercent:80,settlement:"win",fees:0}));
  assert.throws(()=>calculateBinarySettlement({stake:10.001,payoutPercent:80,settlement:"win",fees:0}));
  assert.throws(()=>calculateBinarySettlement({stake:10,payoutPercent:80,settlement:"loss",refundAmount:11,fees:0}));
  assert.throws(()=>calculateBinarySettlement({stake:10,payoutPercent:80,settlement:"push",refundAmount:5,fees:0}));
});
test("expired at a later time required and explicit expiry math",()=>{
  validateBinaryExpiry("2026-10-30T08:00:00Z","2026-10-30T08:01:00Z");
  assert.throws(()=>validateBinaryExpiry("2026-10-30T08:00:00Z","2026-10-30T07:59:00Z"));
  assert.throws(()=>validateBinaryExpiry("2026-10-30T08:00:00Z","not a date"));
});
test("breakeven win rate accounts for trading fees and loss rebates",()=>{
  assert.ok(breakevenWinRatePercent(80,100,0)<56);
  assert.ok(breakevenWinRatePercent(80,100,2)>56);
  assert.ok(breakevenWinRatePercent(80,100,0,10)<56);
});
test("binary analytics exclude refunded contracts from decision win rate",()=>{
  const x=calculateBinaryPerformance([
    {instrument_type:"binary_option",binary_payout_ratio:.8,stake:100,fees:0,result:"win",pnl:80},
    {instrument_type:"binary_option",binary_payout_ratio:.8,stake:100,fees:0,result:"loss",pnl:-100},
    {instrument_type:"binary_option",binary_payout_ratio:.8,stake:100,fees:0,result:"breakeven",pnl:0},
    {instrument_type:"binary_option",binary_payout_ratio:.8,stake:100,fees:0,result:"open",pnl:0},
  ]);
  assert.equal(x.total,3);assert.equal(x.wins,1);assert.equal(x.losses,1);
  assert.equal(x.refunds,1);assert.equal(x.winRatePercent,50);
  assert.equal(x.realizedPnl,-20);
});
test("general analytics count settlements rather than fee sign",()=>{
  const make=(id,result,pnl)=>({id,entered_at:"2026-10-30T10:00:00Z",exited_at:"2026-10-30T10:01:00Z",
    pnl,result,risk_pct:null,planned_rr:null,realized_rr:null,followed_plan:true,checklist_completed:true,
    asset:"EURUSD",strategy_id:null,session:"london",setup_quality:5,confidence:5,duration_seconds:60,tags:[]});
  const ts=[make("1","win",-1),make("2","loss",-100),make("3","breakeven",0),make("4","open",0)];
  const x=computeMetrics(ts,1000);
  assert.equal(x.wins,1);assert.equal(x.losses,1);assert.equal(x.winRate,50);
  assert.equal(x.netPnl,-101);assert.equal(x.openTrades,1);
  const p=rollup(ts,bucketMonth)[0];assert.equal(p.winRate,50);
});
test("account balance reconciles realized results and posted cash movements, not earmarks",()=>{
  const balance=expectedCashBalance(1000,[{result:"win",pnl:80},{result:"loss",pnl:-100},{result:"open",pnl:0}],
    [{kind:"deposit",amount:200},{kind:"withdrawal",amount:50}]);
  assert.equal(balance,1130);assert.equal(balanceVariance(1129.99,balance),-0.01);
});
test("multi-currency totals never sum USD to KES",()=>{
  assert.deepEqual(groupBalancesByCurrency([{currency:"USD",current_balance:80},{currency:"KES",current_balance:1000},{currency:"USD",current_balance:20}]),
    [{currency:"KES",balance:1000},{currency:"USD",balance:100}]);
});
test("allocations sum to exact cents",()=>{
  const portions=splitAllocationCents(0.05,[30,40,20,10]);
  assert.equal(portions.reduce((a,b)=>a+b,0),0.05);
  assert.throws(()=>splitAllocationCents(100,[50,40,20]));
});
test("import hashes stable across retry and account/source scoped",async()=>{
  const x={accountId:"accountA",provider:"mt4",brokerTradeId:"ticket-001"};
  const a=await importFingerprint(x);
  const b=await importFingerprint(x);
  const c=await importFingerprint({...x,accountId:"accountB"});
  assert.equal(a,b);assert.notEqual(a,c);assert.equal(a.length,64);
  const groups=distinctImportKeys([{import_fingerprint:a},{import_fingerprint:a},{import_fingerprint:c}]);
  assert.equal(groups.unique.length,2);assert.equal(groups.repeated.length,1);
});
