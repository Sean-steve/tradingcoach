/** Offline production release checks: never print or submit secrets. */
export type ProductionConfig = Record<string,string|undefined>;
export type Finding = {name:string;severity:"blocker"|"warning";detail:string};

function isStrongSecret(value:string|undefined) {
  return !!value && value.length>=32 && !/^(REPLACE|changeme|test|example|your)/i.test(value);
}

function isHttpsEndpoint(raw:string|undefined):boolean {
  if(!raw)return false;
  try {
    const u=new URL(raw);
    return u.protocol==="https:" && !!u.hostname && !u.username && !u.password
      && !["localhost","127.0.0.1"].includes(u.hostname);
  }catch{return false}
}

export function productionPreflight(e:ProductionConfig):Finding[] {
  const errors:Finding[]=[];
  const block=(name:string,detail:string)=>errors.push({name,severity:"blocker",detail});
  const warn=(name:string,detail:string)=>errors.push({name,severity:"warning",detail});
  if(e.NODE_ENV!=="production")block("NODE_ENV","Must be production");
  const upstream=e.SUPABASE_URL;
  if(!isHttpsEndpoint(upstream)&&e.TRADE_OS_PRIVATE_DB_HTTP!=="yes")
    block("SUPABASE_URL","Use HTTPS; private HTTP requires an explicitly approved internal network");
  if(!e.SUPABASE_PUBLISHABLE_KEY||/REPLACE_WITH|changeme/i.test(e.SUPABASE_PUBLISHABLE_KEY))
    block("SUPABASE_PUBLISHABLE_KEY","Must be configured");
  if(!e.SUPABASE_SERVICE_ROLE_KEY||/REPLACE_WITH|changeme/i.test(e.SUPABASE_SERVICE_ROLE_KEY))
    block("SUPABASE_SERVICE_ROLE_KEY","Server-only privileged key required");
  if(!isStrongSecret(e.TRADE_OS_CRON_SECRET))
    block("TRADE_OS_CRON_SECRET","Require 32+ unpredictable characters");
  if(e.VITE_SUPABASE_URL!==upstream && !e.TRADE_OS_PUBLIC_SUPABASE_URL)
    block("VITE_SUPABASE_URL","Must agree with the server URL or define public Supabase URL");
  if(!e.VITE_SUPABASE_PUBLISHABLE_KEY || e.VITE_SUPABASE_PUBLISHABLE_KEY!==e.SUPABASE_PUBLISHABLE_KEY)
    block("VITE_SUPABASE_PUBLISHABLE_KEY","Must match publishable browser key");
  for(const [key,value] of Object.entries(e)){
    if(/^VITE_/i.test(key)&&/(SECRET|SERVICE_ROLE|DATABASE_URL|CRON_SECRET|AI_API_KEY)/i.test(key)&&value)
      block(key,"Privileged credentials must never be browser-build variables");
  }
  if(e.AI_API_BASE_URL&&(!e.AI_MODEL||!isHttpsEndpoint(e.AI_API_BASE_URL)))
    block("AI_PROVIDER","Remote AI requires both model and HTTPS; local Ollama only for private dev");
  if(!e.AI_API_BASE_URL)warn("AI_PROVIDER","Offline deterministic coaching mode; remote model not enabled");
  if(!isHttpsEndpoint(e.TRADE_OS_APP_URL))block("TRADE_OS_APP_URL","Public app must be an HTTPS URL");
  if(!e.TRADE_OS_RELEASE_SHA||!/^[a-f0-9]{7,40}$/.test(e.TRADE_OS_RELEASE_SHA))
    warn("TRADE_OS_RELEASE_SHA","Set to the deployed Git commit for diagnostics");
  if(e.TRADE_OS_PRIVATE_DB_HTTP==="yes")
    warn("TRADE_OS_PRIVATE_DB_HTTP","Operator must ensure private networking and TLS termination");
  return errors;
}

/** Returns safe summary with no values from the environment. */
export function preflightSummary(findings:Finding[]) {
  return {blockers:findings.filter(x=>x.severity==="blocker").map(x=>x.name),
    warnings:findings.filter(x=>x.severity==="warning").map(x=>x.name)};
}
