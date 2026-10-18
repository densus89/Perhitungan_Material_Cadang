import "server-only";

function canonicalOrigin(value: string | undefined): string | null {
  if (!value || value.trim() !== value) return null;
  try {
    const url = new URL(value);
    if (!["https:", "http:"].includes(url.protocol) || url.username || url.password || url.pathname !== "/" || url.search || url.hash) return null;
    return url.origin;
  } catch { return null; }
}

function vercelOrigin(host: string | undefined): string | null {
  return host && /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.vercel\.app$/.test(host) ? `https://${host}` : null;
}

/** Trust deployment configuration only, never request Host/forwarding headers. */
export function hasTrustedMutationOrigin(request: Request): boolean {
  const expected = canonicalOrigin(process.env.NEXT_PUBLIC_SITE_URL);
  if (!expected) return false;
  let trusted = [expected];
  if (process.env.VERCEL_ENV === "preview") {
    // Both values are Vercel system-provided hostnames. The generated URL is
    // mandatory; the stable branch alias is accepted only when independently valid.
    const deployment = vercelOrigin(process.env.VERCEL_URL);
    if (process.env.VERCEL !== "1" || !deployment) return false;
    trusted = [deployment];
    const branch = vercelOrigin(process.env.VERCEL_BRANCH_URL);
    if (branch) trusted.push(branch);
  }
  return trusted.includes(request.headers.get("origin") ?? "") && request.headers.get("sec-fetch-site") !== "cross-site";
}
