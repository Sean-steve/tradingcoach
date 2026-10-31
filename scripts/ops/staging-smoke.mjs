import { pathToFileURL } from "node:url";

/**
 * Read-only, remotely targeted verification. No fixture creation, migration,
 * queue execution, trading mutation or browser credentials are used here.
 */
export function validateDeploymentTarget(raw) {
  if (!raw) throw Error("TRADE_OS_APP_URL is required");
  let url;
  try { url = new URL(raw); } catch { throw Error("Invalid deployment URL"); }
  if (url.protocol !== "https:" || !url.hostname || url.username || url.password ||
      url.search || url.hash || url.pathname !== "/" ||
      /(^localhost$|^127\.0\.0\.1$|\.invalid$|\.example$|example\.com$)/i.test(url.hostname)) {
    throw Error("Deployment URL must be a genuine public HTTPS origin");
  }
  return url.origin;
}

function assertReleaseSha(value) {
  if (!/^[a-f0-9]{40}$/.test(value || "")) throw Error("Expected release must be a full 40-character Git SHA");
}
function assertEnvironment(value) {
  if (value !== "staging" && value !== "production") throw Error("Expected environment must be staging or production");
}
async function probe(fetcher, base, path, { method = "GET", token } = {}) {
  try {
    const res = await fetcher(base + path, {
      method,
      redirect: "manual",
      signal: AbortSignal.timeout(12000),
      headers: token ? { Authorization: "Bearer " + token } : {},
    });
    if (res.status >= 300 && res.status < 400) throw Error("redirect");
    return res;
  } catch {
    throw Error("Remote probe failed: " + path);
  }
}
async function json(res, path) {
  try { return await res.json(); } catch { throw Error("Invalid JSON from " + path); }
}
function requireStatus(res, expected, path) {
  if (res.status !== expected) throw Error(path + " returned unexpected HTTP " + res.status);
}

export async function verifyDeployment(env, fetcher = globalThis.fetch) {
  const base = validateDeploymentTarget(env.TRADE_OS_APP_URL);
  const expectedSha = env.TRADE_OS_EXPECTED_SHA;
  const expectedEnvironment = env.TRADE_OS_EXPECTED_ENV || "staging";
  const secret = env.TRADE_OS_CRON_SECRET;
  assertReleaseSha(expectedSha);
  assertEnvironment(expectedEnvironment);
  if (!secret || secret.length < 32 || /^(replace|example|changeme)/i.test(secret))
    throw Error("Protected worker GET needs a configured 32+ character secret");

  const health = await probe(fetcher, base, "/api/health");
  requireStatus(health, 200, "/api/health");
  const healthData = await json(health, "/api/health");
  if (healthData.status !== "ok" || healthData.service !== "trade-os" ||
      healthData.release !== expectedSha || healthData.environment !== expectedEnvironment)
    throw Error("Release identity or environment mismatch");

  const ready = await probe(fetcher, base, "/api/ready");
  requireStatus(ready, 200, "/api/ready");
  const readyData = await json(ready, "/api/ready");
  if (readyData.status !== "ready" || readyData.database !== "reachable" ||
      readyData.financial_schema !== "phase-f1")
    throw Error("Database not verified ready");

  const anonymousRead = await probe(fetcher, base, "/api/internal/intelligence");
  requireStatus(anonymousRead, 401, "anonymous worker GET");
  const anonymousWrite = await probe(fetcher, base, "/api/internal/intelligence", { method: "POST" });
  requireStatus(anonymousWrite, 401, "anonymous worker POST");
  const protectedRead = await probe(fetcher, base, "/api/internal/intelligence", { token: secret });
  requireStatus(protectedRead, 200, "authorized worker GET");
  const queueData = await json(protectedRead, "authorized worker GET");
  if (queueData.status !== "ok" || !queueData.queue ||
      Object.values(queueData.queue).some(value => !Number.isInteger(value) || value < 0) ||
      queueData.queue.failed !== 0 || queueData.queue.overdue !== 0)
    throw Error("Queue health is degraded or malformed");

  return { status: "verified", environment: expectedEnvironment, release: expectedSha,
    checks: ["release identity", "financial schema ready", "worker authentication", "queue health"] };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  verifyDeployment(process.env)
    .then(report => console.log("TRADE OS remote read-only verification PASS:", JSON.stringify(report)))
    .catch(error => { console.error("TRADE OS remote verification BLOCKED:", error.message); process.exitCode = 1; });
}
