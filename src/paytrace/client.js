/**
 * HTTP plumbing shared by every PayTrace call:
 *   - Fetch and cache the OAuth Bearer token (valid about 2 hours).
 *   - Add the Authorization and X-Integrator-Id headers to every call.
 *   - Unwrap V3's { data: ... } envelope.
 *   - Turn HTTP errors (including 422 validation errors) into one error type.
 */

const { config } = require("./config");

class PayTraceError extends Error {
  constructor(message, { status, body, cause, outcomeUnknown = false } = {}) {
    super(message, { cause });
    this.name = "PayTraceError";
    this.status = status; // HTTP status; undefined when no response arrived
    this.body = body; // PayTrace's error body, e.g. the 422 field list
    // True only when the request was sent but no response came back,
    // so PayTrace may or may not have processed it. Check before retrying.
    this.outcomeUnknown = outcomeUnknown;
  }
}

// ---- Auth ------------------------------------------------------------------

let cachedToken = null; // { value, expiresAt }

async function getAccessToken() {
  if (cachedToken && Date.now() < cachedToken.expiresAt - 60_000)
    return cachedToken.value;

  if (!config.username || !config.password) {
    throw new PayTraceError("PT_USERNAME and PT_PASSWORD must be set");
  }

  let res;
  try {
    // The token endpoint requires a form-encoded body; it reads a JSON body
    // as missing credentials and returns 401 "Invalid Credentials".
    res = await fetch(`${config.baseUrl}/v3/token`, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        "X-Integrator-Id": config.integratorId,
      },
      body: new URLSearchParams({
        grant_type: "client_credentials",
        client_id: config.username,
        client_secret: config.password,
      }),
      signal: AbortSignal.timeout(config.timeoutMs),
    });
  } catch (cause) {
    // No payment was attempted, so the outcome is known: nothing happened.
    throw new PayTraceError("Token request failed before a response arrived", {
      cause,
    });
  }
  const json = await res.json().catch(() => ({}));
  const d = json.data || json;
  if (!res.ok || !d.access_token) {
    throw new PayTraceError("Could not get an access token", {
      status: res.status,
      body: json,
    });
  }
  cachedToken = {
    value: d.access_token,
    expiresAt: Date.now() + Number(d.expires_in || 7200) * 1000,
  };
  return cachedToken.value;
}

// ---- Request wrapper ---------------------------------------------------------

async function apiRequest(method, path, { body, query } = {}, isRetry = false) {
  const url = new URL(path, config.baseUrl);
  for (const [k, v] of Object.entries(query || {})) {
    if (v !== undefined && v !== null && v !== "")
      url.searchParams.set(k, String(v));
  }

  // Fetched outside the try below: a token failure means the payment was never sent.
  const token = await getAccessToken();

  let res;
  try {
    res = await fetch(url, {
      method,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
        ...(config.integratorId
          ? { "X-Integrator-Id": config.integratorId }
          : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(config.timeoutMs),
    });
  } catch (cause) {
    throw new PayTraceError(`${method} ${path} sent, but no response arrived`, {
      cause,
      outcomeUnknown: true,
    });
  }

  const json = await res.json().catch(() => ({}));

  // An expired or revoked token is rejected before anything is processed,
  // so one retry with a fresh token is safe.
  if (res.status === 401 && !isRetry) {
    cachedToken = null;
    return apiRequest(method, path, { body, query }, true);
  }
  if (!res.ok) {
    throw new PayTraceError(`${method} ${path} returned HTTP ${res.status}`, {
      status: res.status,
      body: json,
    });
  }
  return json.data !== undefined ? json.data : json;
}

module.exports = { PayTraceError, getAccessToken, apiRequest };
