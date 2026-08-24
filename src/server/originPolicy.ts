export interface OriginPolicy {
  allowedOrigins: readonly string[];
  isProduction: boolean;
}

function normalizedHttpOrigin(value: string): string | undefined {
  try {
    const url = new URL(value);
    if (url.protocol !== "http:" && url.protocol !== "https:") return undefined;
    if (url.username || url.password || url.search || url.hash) return undefined;
    if (url.pathname !== "/") return undefined;
    return url.origin;
  } catch {
    return undefined;
  }
}

/**
 * Turn the comma-separated deployment setting and the platform-provided public
 * URL into a small, de-duplicated exact allow-list.
 */
export function configuredOrigins(configuredValue = "", serviceUrl = ""): string[] {
  const candidates = [...configuredValue.split(","), serviceUrl];
  const origins = candidates
    .map((value) => normalizedHttpOrigin(value.trim()))
    .filter((origin): origin is string => Boolean(origin));

  return [...new Set(origins)];
}

/**
 * Requests with no Origin header are server-to-server or same-process calls.
 * Browser origins must match the production allow-list exactly. Local HTTP
 * origins are accepted only outside production for the Vite development app.
 */
export function isOriginAllowed(
  origin: string | undefined,
  { allowedOrigins, isProduction }: OriginPolicy,
): boolean {
  if (!origin) return true;

  const normalizedOrigin = normalizedHttpOrigin(origin);
  if (!normalizedOrigin || normalizedOrigin !== origin) return false;

  if (allowedOrigins.includes(origin)) return true;
  if (isProduction || normalizedOrigin.startsWith("https://")) return false;

  const { hostname } = new URL(normalizedOrigin);
  return hostname === "localhost" || hostname === "127.0.0.1";
}
