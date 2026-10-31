import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync, readdirSync } from "node:fs";

const read = path => readFileSync(path,"utf8");
const pkg=JSON.parse(read("package.json"));

test("Phase D: canonical branch policy and independent platform",()=>{
 const rules=read("AGENTS.md");
 assert.match(rules,/main.*authoritative/);
 assert.doesNotMatch(rules,/This project is connected to \[Lovable\]/);
 assert.ok(!existsSync("src/integrations/lovable/index.ts"));
 assert.ok(!existsSync("src/lib/lovable-error-reporting.ts"));
 assert.ok(!existsSync(".lovable/project.json"));
 assert.doesNotMatch(read("vite.config.ts"),/@lovable\.dev|lovableBuildPlugin/);
});

test("Phase D: no runtime or build dependency on Lovable",()=>{
 for(const [scope,deps] of Object.entries({dependencies:pkg.dependencies,devDependencies:pkg.devDependencies})){
   assert.ok(!Object.keys(deps||{}).some(x=>x.startsWith("@lovable.dev/")),scope+" depends on Lovable");
 }
});

test("Phase D: no tracked root .env, only safe template",()=>{
 assert.equal(existsSync(".env"),false,"Never ship tracked runtime .env");
 assert.ok(existsSync(".env.example"));
 const ignore=read(".gitignore");
 assert.match(ignore,/\.env/);
 assert.match(ignore,/\.env\.\*/);
});

test("Phase D: isolated local Supabase and no parallel binary contract migration",()=>{
 assert.match(read("supabase/config.toml"),/project_id\s*=\s*"trade-os-local"/);
 const names=readdirSync("supabase/migrations");
 assert.ok(names.some(x=>x.includes("20261030220000_binary_options_and_import_integrity")));
 assert.ok(names.some(x=>x.includes("20261031110000_binary_settlement_balance_trigger_fix")));
 assert.ok(names.some(x=>x.includes("20261031111000_private_trade_screenshots_bucket")));
 assert.equal(names.some(x=>x.includes("20261030210000_phase2_trading_financial")),false,
   "Alternate Phase 2 schema is incompatible; preserve only in reference branch");
});

test("Phase E: main push and PR run full certification without competing Supabase stacks",()=>{
 for(const path of [".github/workflows/ci.yml",".github/workflows/phase-c-local-certification.yml",".github/workflows/production-container.yml"]){
   const yml=read(path);
   assert.match(yml,/pull_request:/,path+" missing PR checks");
   assert.match(yml,/push:[\s\S]*?branches:\s*\[[^\]]*"main"/,path+" missing main checks");
   assert.match(yml,/concurrency:/,path+" missing workflow concurrency");
 }
 const focused=read(".github/workflows/local-stack.yml");
 assert.match(focused,/workflow_dispatch:/,"Standalone Supabase smoke must remain manually runnable");
 assert.doesNotMatch(focused,/\n\s+pull_request:|\n\s+push:/,"Manual DB suite must not race full-stack automatic CI");
 assert.match(read(".github/workflows/phase-c-local-certification.yml"),/tradeos-local-supabase/);
});

test("Phase D: previous user experiences and test suite retained",()=>{
 for(const path of [
 "src/routes/_authenticated/trades/new.tsx",
 "src/routes/_authenticated/import.tsx",
 "src/routes/_authenticated/interventions.tsx",
 "src/routes/_authenticated/goals.tsx",
 "src/routes/_authenticated/rewards.tsx",
 "src/routes/_authenticated/coach.tsx",
 "scripts/local/certify-api.mjs",
 "scripts/local/certify-browser.mjs",
 "docs/development/PHASE_D_REPOSITORY_CONSOLIDATION.md"
 ])assert.ok(existsSync(path),path+" absent from canonical tree");
});
