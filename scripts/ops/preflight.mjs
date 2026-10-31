import { productionPreflight, preflightSummary } from "../../src/lib/production-preflight.ts";
const result=productionPreflight(process.env);
const counts=preflightSummary(result);
console.log("TRADE OS production preflight:",JSON.stringify(counts));
for(const item of result)console.log(item.severity.toUpperCase()+": "+item.name+" — "+item.detail);
if(counts.blockers.length) process.exitCode=1;
