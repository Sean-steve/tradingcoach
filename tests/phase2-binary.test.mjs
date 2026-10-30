import test from "node:test";
import assert from "node:assert/strict";
import { binaryNetPnl, binaryBreakevenWinRate, binaryExpectedNetPerTrade, binaryAnalytics } from "../src/lib/binary-options.ts";

test("binary win is NET payout, not gross returned capital", () => {
  assert.equal(binaryNetPnl({ stake: 100, payoutPercent: 80, settlement: "win" }), 80);
  assert.equal(binaryNetPnl({ stake: 100, payoutPercent: 80, settlement: "win", fees: 2 }), 78);
});
test("binary loss risks stake once plus fees", () => {
  assert.equal(binaryNetPnl({ stake: 100, payoutPercent: 80, settlement: "loss" }), -100);
  assert.equal(binaryNetPnl({ stake: 100, payoutPercent: 80, settlement: "loss", fees: 2 }), -102);
});
test("push, void, and pending maintain correct realized P&L", () => {
  assert.equal(binaryNetPnl({ stake: 100, payoutPercent: 80, settlement: "push" }), 0);
  assert.equal(binaryNetPnl({ stake: 100, payoutPercent: 80, settlement: "void", refundAmount: 25 }), -75);
  assert.equal(binaryNetPnl({ stake: 100, payoutPercent: 80, settlement: "pending" }), 0);
});
test("payout-adjusted break-even and expectancy", () => {
  assert.ok(Math.abs(binaryBreakevenWinRate(80) - 55.5555555) < 0.0001);
  assert.equal(binaryExpectedNetPerTrade(100, 80, 60), 8);
  assert.equal(binaryExpectedNetPerTrade(100, 80, 50), -10);
});
test("invalid payouts and refunds fail validation", () => {
  assert.throws(() => binaryNetPnl({ stake: 0, payoutPercent: 80, settlement: "win" }));
  assert.throws(() => binaryNetPnl({ stake: 100, payoutPercent: 80, settlement: "void", refundAmount: 101 }));
  assert.throws(() => binaryBreakevenWinRate(0));
});
test("binary-only analytics exclude pending and pushes from measured win rate", () => {
  const d = binaryAnalytics([
    { contract_type: "binary", binary_outcome: "win", stake: 100, payout_percent: 80, pnl: 80, result: "win" },
    { contract_type: "binary", binary_outcome: "loss", stake: 100, payout_percent: 80, pnl: -100, result: "loss" },
    { contract_type: "binary", binary_outcome: "push", stake: 100, payout_percent: 80, pnl: 0, result: "breakeven" },
    { contract_type: "binary", binary_outcome: "pending", stake: 100, payout_percent: 80, pnl: 0, result: "open" },
    { contract_type: "spot", stake: 100, payout_percent: null, pnl: 200, result: "win" },
  ]);
  assert.equal(d.total, 3);
  assert.equal(d.wins, 1);
  assert.equal(d.losses, 1);
  assert.equal(d.refunded, 1);
  assert.equal(d.winRate, 50);
  assert.equal(d.realizedNetPnl, -20);
});
