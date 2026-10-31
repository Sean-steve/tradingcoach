import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const file = path => readFileSync(new URL("../"+path,import.meta.url),"utf8");

test("F.2 historical audit contains only read-only statements",()=>{
  const sql=file("scripts/ops/historical-financial-audit.sql")
    .replace(/--[^\n]*/g,"");
  assert.match(sql,/BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY;/);
  assert.match(sql,/\bCOMMIT;/);
  assert.doesNotMatch(sql,/\b(INSERT|UPDATE|DELETE|TRUNCATE|ALTER|DROP|CREATE|GRANT|REVOKE|CALL|DO|COPY|EXECUTE|VACUUM)\b/i);
  assert.match(sql,/trade_currency_unreviewed/);
  assert.match(sql,/cash_movement_id/);
  assert.match(sql,/event_variance/);
});

test("F.2 browser gate cannot ignore known pre-mount React console errors",()=>{
  const browser=file("scripts/local/certify-browser.mjs");
  assert.match(browser,/assert\.equal\(consoleErrors\.length,0/);
  assert.doesNotMatch(browser,/nonBlockingWarning|acknowledged = consoleErrors|PHASE C KNOWN REACT WARNING/);
});

test("F.2 release gate requires audited financial review on exact SHA",()=>{
  const prod=file(".github/workflows/phase-f-production-gate.yml");
  const review=file(".github/workflows/phase-f2-financial-release-review.yml");
  assert.match(prod,/phase-f2-financial-release-review\.yml/);
  assert.match(prod,/for issue in 8 9/);
  assert.match(review,/environment: trade-os-financial-review/);
  assert.match(review,/"refs\/heads\/main"/);
  assert.match(review,/historical_audit_sha256/);
  assert.match(review,/restore_evidence_sha256/);
  assert.match(review,/currency_and_balance_reconciled/);
});

test("F.2 remote readiness binds financial schema to target identity",()=>{
  const stage=file("scripts/ops/staging-smoke.mjs");
  const api=file("src/routes/api/ready.ts");
  assert.match(stage,/financial_schema !== "phase-f1"/);
  assert.match(stage,/project_ref !== expectedProject/);
  assert.match(api,/account_cash_movements/);
  assert.match(api,/trade_import_runs/);
  assert.match(api,/target_mismatch/);
});
