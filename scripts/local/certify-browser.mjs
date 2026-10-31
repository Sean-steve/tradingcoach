// Phase C Browser Certification — every interaction runs against LIVE LOCAL Supabase.
// No mocks, stubbed network responses, or screenshots of synthetic dashboards.
// Requires: SUPABASE_URL / SUPABASE_PUBLISHABLE_KEY and local app on port 8080.
import assert from "node:assert/strict";
import { randomUUID, createHash } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { chromium } from "playwright";
import { mkdir } from "node:fs/promises";

const root=process.env.TRADE_OS_LOCAL_APP_URL || "http://127.0.0.1:8080";
const url=process.env.SUPABASE_URL;
const key=process.env.SUPABASE_PUBLISHABLE_KEY;
if(!url||!key)throw Error("Load local Supabase env first");
for(const value of [root,url]) {
  const target=new URL(value);
  assert.ok(["localhost","127.0.0.1","::1"].includes(target.hostname),"Only loopback testing is permitted");
}
const db=createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}});
const tag=randomUUID().slice(0,9);
const email=`phase-c-ui-${tag}@example.test`;
const password="PhaseC-Test-"+randomUUID()+"!z";
const {data:userData,error:signError}=await db.auth.signUp({email,password});
if(signError||!userData.session?.access_token)throw Error("Local browser test cannot provision auth: "+signError?.message);
const uid=userData.user.id;
const {data:acct,error:acctError}=await db.from("accounts").select("*").eq("is_default",true).single();
if(acctError)throw acctError;
const {error:tomError}=await db.from("tom_versions").insert({
  user_id:uid,version:1,is_active:true,
  identity:"Phase C local UI test: follow a written plan, review each outcome",
  markets:["BTCUSD","USDCHF","EURUSD"],sessions:["london"],
  change_reason:"Set initial audit manual in disposable local browser test"
});
if(tomError)throw tomError;

const browser=await chromium.launch({headless:true,args:["--no-sandbox"]});
const context=await browser.newContext({viewport:{width:1440,height:900},baseURL:root});
const page=await context.newPage();
const pageErrors=[];
const networkErrors=[];
let stepNumber=0;
page.on("pageerror",err=>pageErrors.push(err.message));
page.on("console",msg=>{if(msg.type()==="error")pageErrors.push(msg.text().slice(0,200));});
page.on("response",res=>{
 const path=new URL(res.url()).pathname;
 if(path.includes("/auth/v1/")&&res.status()>=400)networkErrors.push({path,status:res.status()});
});
const pause=async ms=>new Promise(ok=>setTimeout(ok,ms));
async function until(predicate,name,attempts=30){
 for(let i=0;i<attempts;i++){if(await predicate())return;await pause(300)}
 throw Error("Timed out waiting for: "+name);
}
async function step(name,action){
 try{
  await action();
  console.log("UI PASS "+String(++stepNumber).padStart(2,"0")+" "+name);
 } catch(error) {
  await mkdir("artifacts/phase-c",{recursive:true});
  const path="artifacts/phase-c/failed-"+stepNumber+"-"+name.replace(/[^a-z0-9-]/gi,"-")+".png";
  await page.screenshot({path,fullPage:true}).catch(()=>{});
  console.error("UI FAIL "+name+" screenshot="+path);
  console.error("UI DIAGNOSTIC",JSON.stringify({
    url:page.url(), pageErrors:pageErrors.slice(-8),netErrors:networkErrors.slice(-8),
    text:(await page.locator("body").innerText().catch(()=>"[unreadable]")).slice(-700)
  }));
  throw error;
 }
}
async function visit(path,expected){
 await page.goto(root+path,{waitUntil:"domcontentloaded"});
 await page.locator("aside nav").waitFor({state:"visible",timeout:20000});
 await page.locator("main h1,main h2").first().waitFor({state:"visible",timeout:20000});
 const body=await page.locator("main").innerText();
 assert.ok(body.length>30,"Empty "+path);
 assert.ok(!body.includes("This page didn't load"),"Crash screen for "+path);
 if(expected)assert.ok(body.includes(expected),"Screen "+path+" lacks '"+expected+"': "+body.slice(0,350));
}
try {
 await step("Email/password login routes to command center",async()=>{
  await page.goto(root+"/auth",{waitUntil:"domcontentloaded"});
  await page.locator("#email").fill(email);
  await page.locator("#password").fill(password);
  await page.getByRole("button",{name:"Sign in",exact:true}).click();
  await page.waitForTimeout(1000);
  const sessionCheck=await page.evaluate(async()=>{
    try {
      const {supabase}=await import("/src/integrations/supabase/client.ts");
      const sess=await supabase.auth.getSession();
      const user=await supabase.auth.getUser();
      return {session:!!sess.data.session,sessionError:sess.error?.message,
        user:!!user.data.user,userError:user.error?.message,
        storageKeys:Object.keys(localStorage).filter(x=>x.startsWith("sb-")).length};
    } catch(e){return {debugError:e instanceof Error?e.message:String(e)};}
  });
  console.log("AUTH SESSION DIAGNOSTIC",JSON.stringify(sessionCheck));
  console.log("AUTH NAV DIAGNOSTIC",JSON.stringify({
    path:new URL(page.url()).pathname,pageErrors:pageErrors.slice(-5),netErrors:networkErrors.slice(-5),
    text:(await page.locator("body").innerText()).slice(-220)
  }));
  await page.waitForURL(/\/dashboard(?:\?|$)/,{timeout:20000});
  await page.locator("aside nav").waitFor({timeout:20000});
 });
 await step("Unsigned users cannot open protected routes",async()=>{
  const guest=await browser.newContext({baseURL:root});
  const guestPage=await guest.newPage();
  await guestPage.goto(root+"/accounts");
  await guestPage.waitForURL(/\/auth\b/,{timeout:20000});
  await guest.close();
 });
 const paths=[
  ["/dashboard",null],["/trades","Trade Journal"],["/trades/new","Log a trade"],
  ["/import","CSV Import"],["/analytics","Advanced Analytics"],
  ["/insights","Validated insights"],["/memory","Trader Memory"],
  ["/graph","Knowledge Graph"],["/interventions","Guardrails"],
  ["/twin","Counterfactual replay"],["/manual","single source of truth"],
  ["/strategies",null],["/sessions",null],["/assets",null],
  ["/psychology","Psychology"],["/discipline",null],["/rules",null],
  ["/goals","Goals"],["/habits",null],["/challenges",null],
  ["/forecast",null],["/rewards","reward"],["/coach","AI Performance Coach"],
  ["/score",null],["/notifications",null],["/accounts","Accounts"],
  ["/reports",null],["/settings",null]
 ];
 for(const [path,expected] of paths)await step("Screen renders "+path,()=>visit(path,expected));
 await step("Trade form persists an actual closed spot trade",async()=>{
  await visit("/trades/new","Log a trade");
  await page.getByPlaceholder("EURUSD, BTCUSD, SPY…").fill("BTCUSD");
  await page.getByPlaceholder("e.g. 125 or -80").fill("25");
  await page.getByRole("button",{name:"Save trade"}).click();
  await page.waitForURL(/\/trades(?:\?|$)/,{timeout:18000});
  await page.getByText("BTCUSD",{exact:true}).first().waitFor({timeout:10000});
  const {data,error}=await db.from("trades").select("asset,pnl,result").eq("account_id",acct.id).eq("asset","BTCUSD").order("created_at",{ascending:false}).limit(1).single();
  if(error)throw error;
  assert.equal(data.result,"win");
  assert.equal(Number(data.pnl),25);
 });
 await step("CSV import maps, persists and deduplicates rows",async()=>{
  await visit("/import","CSV Import");
  await page.locator('input[type="file"][accept*="csv"]').setInputFiles({
    name:"phase-c-local.csv",mimeType:"text/csv",
    buffer:Buffer.from('asset,entry_time,exit_time,direction,pnl,fees,ticket\nUSDCHF,2026-10-27T08:00:00Z,2026-10-27T08:05:00Z,long,42,0,phase-c-ui-'+tag+'\n')
  });
  await page.getByText("1 rows detected").waitFor({timeout:10000});
  await page.getByRole("button",{name:"Import 1 trades"}).click();
  await page.getByRole("status").filter({hasText:"Imported 1 unique trades"}).waitFor({timeout:18000});
  await page.getByRole("button",{name:"Import 1 trades"}).click();
  await page.getByRole("status").filter({hasText:"skipped 1 duplicates"}).waitFor({timeout:18000});
  const expectedKey=createHash("sha256").update(JSON.stringify(["ticket","phase-c-ui-"+tag])).digest("hex");
  const {data,error}=await db.from("trades").select("id").eq("source_key",expectedKey);
  if(error)throw error;
  assert.equal(data.length,1);
 });
 await step("UI creates a financial goal with incremental progress",async()=>{
  await visit("/goals","Goals");
  const section=page.locator("main .glow-card").filter({has:page.getByRole("heading",{name:"New goal"})}).first();
  await section.getByPlaceholder("Hit $2k P&L this month").fill("Phase C UI target "+tag);
  await section.locator('input[type="number"]').first().fill("150");
  await section.getByRole("button",{name:"Add goal"}).click();
  await page.getByText("Phase C UI target "+tag).first().waitFor({timeout:12000});
  const {data,error}=await db.from("goals").select("id,target_value,horizon,target_mode").eq("title","Phase C UI target "+tag).single();
  if(error)throw error;
  assert.equal(Number(data.target_value),150);
  assert.equal(data.target_mode,"incremental");
 });
 await step("UI creates a lifestyle reward, without claiming verified funds",async()=>{
  await visit("/rewards","reward");
  const section=page.locator("main .glow-card").filter({has:page.getByRole("heading",{name:"Plan a real-life reward"})}).first();
  await section.getByPlaceholder("Zanzibar holiday").fill("Phase C UI reward "+tag);
  await section.getByText("Budget (USD)",{exact:true}).locator("..").locator("input").fill("50");
  await section.getByRole("button",{name:"Create reward plan"}).click();
  await page.getByText("Phase C UI reward "+tag).first().waitFor({timeout:12000});
  await page.getByText("Independently verified").first().waitFor({timeout:10000});
  const {data,error}=await db.from("lifestyle_rewards").select("id,budget,status").eq("title","Phase C UI reward "+tag).single();
  if(error)throw error;
  assert.equal(Number(data.budget),50);
  assert.equal(data.status,"planned");
 });
 await step("Offline AI Coach generates and persists real review",async()=>{
  await visit("/coach","AI Performance Coach");
  await page.getByRole("button",{name:"Generate daily review"}).click();
  await page.getByText("Review generated").first().waitFor({timeout:30000});
  const {data,error}=await db.from("coach_reviews").select("model,summary").eq("account_id",acct.id).order("created_at",{ascending:false}).limit(1).single();
  if(error)throw error;
  assert.equal(data.model,"offline-deterministic");
  assert.match(data.summary,/Offline review/);
 });
 await step("Dashboard shows created goal and reward in real account",async()=>{
  await visit("/dashboard",null);
  await page.getByText("Phase C UI target "+tag).first().waitFor({timeout:12000});
  await page.getByText("Phase C UI reward "+tag).first().waitFor({timeout:12000});
 });
 await step("Account selector isolates the journal's visible trade list",async()=>{
  const another=await db.from("accounts").insert({
    user_id:uid,name:"Phase C UI second "+tag,account_type:"personal",starting_balance:2000
  }).select("id").single();
  if(another.error)throw another.error;
  const seed=await db.from("trades").insert({
    user_id:uid,account_id:another.data.id,asset:"NZDJPY",direction:"long",
    entered_at:"2026-10-27T07:00:00Z",exited_at:"2026-10-27T07:05:00Z",
    pnl:12,result:"win"
  });
  if(seed.error)throw seed.error;
  // Reload to invalidate cached accounts after test-side direct API changes.
  await visit("/accounts","Accounts");
  await page.locator('aside button[role="combobox"]').first().click();
  await page.getByRole("option",{name:/Phase C UI second/}).click();
  await visit("/trades","Trade Journal");
  await page.getByText("NZDJPY",{exact:true}).first().waitFor({timeout:10000});
  assert.equal(await page.getByText("BTCUSD",{exact:true}).count(),0,"Trade Journal leaked first account's records");
 });
 assert.equal(pageErrors.length,0,"Unhandled browser exceptions: "+pageErrors.slice(0,5).join(" | "));
 console.log("PHASE C BROWSER CERTIFICATION PASS: "+stepNumber+" assertions including "+paths.length+" screens.");
} finally {
  await context.close();
  await browser.close();
}
