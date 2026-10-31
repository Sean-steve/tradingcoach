import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, chmodSync, rmSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";

const folder=mkdtempSync(join(tmpdir(),"tradeos-restore-guard-"));
const mockDir=join(folder,"bin");
import { mkdirSync } from "node:fs";
mkdirSync(mockDir);
const backup=join(folder,"test.dump");
writeFileSync(backup,"safe-archive-placeholder");
writeFileSync(backup+".sha256",createHash("sha256").update("safe-archive-placeholder").digest("hex")+"  test.dump\n");

const psql=`#!/usr/bin/env bash
case "$*" in
 *"concat_ws"*)
    if [[ "$*" == *"source"* ]]; then echo "127.0.0.1|5432|prod"; else
      echo "\${MOCK_TARGET_ID:-127.0.0.1|5433|scratch}"
    fi ;;
 *"count(*)"*) echo "\${MOCK_TARGET_COUNT:-0}" ;;
 *) exit 44 ;;
esac
`;
const pgRestore=`#!/usr/bin/env bash
if [[ "$1" == "--list" ]]; then exit 0; fi
[[ "$*" == *"--single-transaction"* ]] || exit 66
exit 0
`;
for(const [name,value] of [["psql",psql],["pg_restore",pgRestore]]){
 writeFileSync(join(mockDir,name),value);
 chmodSync(join(mockDir,name),0o700);
}
function run(extra={}){
 return spawnSync("bash",["scripts/ops/restore-rehearsal.sh",backup],{
  env:{...process.env,PATH:mockDir+":"+process.env.PATH,
  TRADE_OS_DATABASE_URL:"postgresql://source:pwd@host/source",
  TRADE_OS_RESTORE_URL:"postgresql://target:pwd@host/target",
  TRADE_OS_RESTORE_APPROVED:"YES",...extra},encoding:"utf8"
 });
}

test("Phase E DR: deny same physical database regardless of different DSNs",()=>{
 const r=run({MOCK_TARGET_ID:"127.0.0.1|5432|prod"});
 assert.notEqual(r.status,0);
 assert.match(r.stderr,/database identity is identical/);
});
test("Phase E DR: deny populated scratch database",()=>{
 const r=run({MOCK_TARGET_COUNT:"3"});
 assert.notEqual(r.status,0);
 assert.match(r.stderr,/scratch database is not empty/);
});
test("Phase E DR: explicit approval is mandatory",()=>{
 const r=run({TRADE_OS_RESTORE_APPROVED:"NO"});
 assert.notEqual(r.status,0);
 assert.match(r.stderr,/approval required/);
});
test("Phase E DR: hash manifest is mandatory",()=>{
 const path=backup+".sha256";
 const contents=readFileSync(path);
 rmSync(path);
 const r=run();
 writeFileSync(path,contents);
 assert.notEqual(r.status,0);
 assert.match(r.stderr,/SHA-256 manifest/);
});
test("Phase E DR: simulated distinct empty target and intact manifest proceed",()=>{
 const r=run();
 assert.equal(r.status,0,r.stderr);
 assert.match(r.stdout,/Restore completed/);
});
process.on("exit",()=>rmSync(folder,{recursive:true,force:true}));
