import "server-only";

function canonicalOrigin(value: string | undefined): string | null {
  if (!value || value.trim() !== value) return null;
  try {
    const url = new URL(value);
    if (!["https:", "http:"].includes(url.protocol) || url.username || url.password || url.pathname !== "/" || url.search || url.hash) return null;
    return url.origin;
  } catch { return null; }
}

/** Trust deployment configuration only, never request Host/forwarding headers. */
export function hasTrustedMutationOrigin(request: Request): boolean {
  let expected = canonicalOrigin(process.env.NEXT_PUBLIC_SITE_URL);
  const canonical = expected, host = process.env.VERCEL_URL, environment = process.env.VERCEL_ENV;
  const previewMode = environment === "preview", vercelFlag = process.env.VERCEL === "1";
  const previewHostMatchesPattern = Boolean(host && /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.vercel\.app$/.test(host));
  const origin = request.headers.get("origin"), crossSite = request.headers.get("sec-fetch-site") === "cross-site";
  const deny = (reason: "CANONICAL_CONFIG_INVALID" | "PREVIEW_CONTEXT_INVALID" | "PREVIEW_HOST_INVALID" | "ORIGIN_MISSING" | "ORIGIN_MISMATCH" | "CROSS_SITE") => {
    // Explicit enums/booleans only: never serialize env values, URLs, headers,
    // request bodies, credentials, identifiers or errors into runtime logs.
    try {
      console.warn(JSON.stringify({
        event: "MUTATION_ORIGIN_DENIED", reason,
        source: previewMode ? "VERCEL_PREVIEW" : "CANONICAL",
        environment: environment === "preview" ? "PREVIEW" : environment === "production" ? "PRODUCTION" : environment === "development" ? "DEVELOPMENT" : environment === undefined ? "MISSING" : "OTHER",
        vercelFlag, canonicalConfigured: Boolean(process.env.NEXT_PUBLIC_SITE_URL), canonicalValid: canonical !== null,
        previewConfigured: Boolean(host), previewHostMatchesPattern, originPresent: Boolean(origin),
        matchesCanonical: canonical !== null && origin === canonical,
        matchesPreview: previewHostMatchesPattern && origin === `https://${host}`, crossSite,
      }));
    } catch { /* Observability must never change the fail-closed decision. */ }
    return false;
  };
  if (!expected) return deny("CANONICAL_CONFIG_INVALID");
  if (previewMode) {
    // VERCEL_URL is a system-provided hostname, not a URL or a branch alias.
    // A missing/malformed preview config fails closed; production stays canonical.
    if (!vercelFlag) return deny("PREVIEW_CONTEXT_INVALID");
    if (!previewHostMatchesPattern) return deny("PREVIEW_HOST_INVALID");
    expected = `https://${host}`;
  }
  if (origin !== expected) return deny(origin ? "ORIGIN_MISMATCH" : "ORIGIN_MISSING");
  return crossSite ? deny("CROSS_SITE") : true;
}
