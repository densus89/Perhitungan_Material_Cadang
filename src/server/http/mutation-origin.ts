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
  if (!expected) return false;
  if (process.env.VERCEL_ENV === "preview") {
    // VERCEL_URL is a system-provided hostname, not a URL or a branch alias.
    // A missing/malformed preview config fails closed; production stays canonical.
    const host = process.env.VERCEL_URL;
    if (process.env.VERCEL !== "1" || !host || !/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.vercel\.app$/.test(host)) return false;
    expected = `https://${host}`;
  }
  return request.headers.get("origin") === expected && request.headers.get("sec-fetch-site") !== "cross-site";
}
