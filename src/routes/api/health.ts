import { createFileRoute } from "@tanstack/react-router";

export const Route=createFileRoute("/api/health")({
  server:{handlers:{GET:async()=>Response.json(
    {status:"ok",service:"trade-os",release:process.env["TRADE_OS_RELEASE_SHA"]?.slice(0,40)||"development",environment:process.env["TRADE_OS_DEPLOYMENT_ENV"]||"unconfigured"},
    {headers:{"Cache-Control":"no-store","X-Content-Type-Options":"nosniff"}}
  )}}
});
