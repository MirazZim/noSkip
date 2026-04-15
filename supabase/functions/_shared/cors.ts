const ALLOWED_ORIGINS = new Set([
  "https://no-skip-main.vercel.app",
  "http://localhost:8080",
]);

export function corsHeaders(origin: string, methods = "POST, OPTIONS") {
  const allowed = ALLOWED_ORIGINS.has(origin) ? origin : "null";
  return {
    "Access-Control-Allow-Origin":  allowed,
    "Access-Control-Allow-Methods": methods,
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Vary": "Origin",
  };
}