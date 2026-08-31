import "server-only";

/**
 * Shared Microsoft Graph app-only (client-credentials) client — the one
 * token-acquisition path both `email.ts` (Mail.Send) and `document-storage.ts`
 * (SharePoint/Sites.Selected) call through. Same Entra ID app registration
 * for both, see AGENTS.md and docs/DOCUMENTS.md.
 */

const GRAPH_BASE_URL = "https://graph.microsoft.com/v1.0";

type CachedToken = { accessToken: string; expiresAt: number };

// Module-level cache: best-effort within one warm serverless instance, not a
// correctness requirement — a cold start just re-fetches. Ten-token buffer
// (`expiresAt - 60_000 > now`) avoids handing out a token that expires mid-request.
let cachedToken: CachedToken | null = null;

export function isGraphConfigured(): boolean {
  return Boolean(process.env.AZURE_TENANT_ID && process.env.AZURE_CLIENT_ID && process.env.AZURE_CLIENT_SECRET);
}

async function getAccessToken(): Promise<string> {
  const now = Date.now();
  if (cachedToken && cachedToken.expiresAt - 60_000 > now) return cachedToken.accessToken;

  const tenantId = process.env.AZURE_TENANT_ID;
  const clientId = process.env.AZURE_CLIENT_ID;
  const clientSecret = process.env.AZURE_CLIENT_SECRET;
  if (!tenantId || !clientId || !clientSecret) {
    throw new Error("Microsoft Graph isn't configured — AZURE_TENANT_ID/AZURE_CLIENT_ID/AZURE_CLIENT_SECRET are missing.");
  }

  const response = await fetch(`https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      scope: "https://graph.microsoft.com/.default",
      grant_type: "client_credentials",
    }),
  });

  if (!response.ok) {
    throw new Error(`Failed to acquire a Microsoft Graph token (${response.status}): ${await response.text()}`);
  }

  const data = (await response.json()) as { access_token: string; expires_in: number };
  cachedToken = { accessToken: data.access_token, expiresAt: now + data.expires_in * 1000 };
  return cachedToken.accessToken;
}

/**
 * Authenticated fetch against Graph's v1.0 endpoint. `path` is relative
 * (e.g. `/sites/{id}/drive`) and gets the base URL + Bearer token attached.
 * Don't use this for an upload-session `uploadUrl` — those are
 * pre-authenticated by Graph and must NOT carry this app's Bearer token;
 * call `fetch()` directly for those chunk PUTs instead.
 */
export async function graphFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const token = await getAccessToken();
  const headers = new Headers(init.headers);
  headers.set("Authorization", `Bearer ${token}`);
  return fetch(`${GRAPH_BASE_URL}${path}`, { ...init, headers });
}

/** `graphFetch()` + JSON parse + a thrown error with the response body on a non-2xx status. */
export async function graphJson<T>(path: string, init: RequestInit = {}): Promise<T> {
  const response = await graphFetch(path, init);
  if (!response.ok) {
    throw new Error(`Microsoft Graph request failed (${response.status} ${path}): ${await response.text()}`);
  }
  return (await response.json()) as T;
}

/** URI-encodes each path segment individually — `encodeURIComponent` on the whole path would also escape the `/` separators Graph's `root:/{path}:` syntax needs literal. */
export function encodeGraphPath(relativePath: string): string {
  return relativePath
    .split("/")
    .filter(Boolean)
    .map((segment) => encodeURIComponent(segment))
    .join("/");
}
