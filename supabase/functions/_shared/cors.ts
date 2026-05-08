const PRODUCTION_ORIGINS = new Set([
  "https://no-skip-main.vercel.app",
]);

export function corsHeaders(origin: string, methods = "POST, OPTIONS") {
  let allowed: string;
  try {
    const { hostname } = new URL(origin);
    const isLocal = hostname === "localhost" || hostname === "127.0.0.1" || hostname === "[::1]";
    allowed = (isLocal || PRODUCTION_ORIGINS.has(origin)) ? origin : "null";
  } catch {
    allowed = PRODUCTION_ORIGINS.has(origin) ? origin : "null";
  }
  return {
    "Access-Control-Allow-Origin":  allowed,
    "Access-Control-Allow-Methods": methods,
    "Access-Control-Allow-Headers": "Content-Type, Authorization, apikey, x-client-info",
    "Vary": "Origin",
  };
}