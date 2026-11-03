/**
 * Minimal PayTrace V3 client.
 *
 * Responsibilities:
 *   - Fetch and cache the OAuth Bearer token (valid about 2 hours).
 *   - Add the Authorization and X-Integrator-Id headers to every call.
 *   - Unwrap V3's { data: ... } envelope.
 *   - Turn HTTP errors (including 422 validation errors) into one error type.
 *
 * Runs on the server only. Never ship credentials or Bearer tokens to a browser.
 */

const config = {
  baseUrl: process.env.PT_BASE_URL || "https://api.sandbox.paytrace.com",
  username: process.env.PT_USERNAME,
  password: process.env.PT_PASSWORD,
  integratorId: process.env.PT_INTEGRATOR_ID,
  merchantId: Number(process.env.PT_MERCHANT_ID),
  protectTokenField: process.env.PT_PROTECT_TOKEN_FIELD || "hpf_token",
  protectKeyField: process.env.PT_PROTECT_KEY_FIELD || "enc_key",
  timeoutMs: 30_000, // Authorizations take a few seconds; never use a short timeout.
};

// Response codes worth naming. Anything else: read response_message.
const CODES = {
  101: "approved",
  102: "declined",
  109: "voided",
  160: "customer created",
  165: "approved and customer created",
};

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

async function getToken() {
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

async function request(method, path, { body, query } = {}, isRetry = false) {
  const url = new URL(path, config.baseUrl);
  for (const [k, v] of Object.entries(query || {})) {
    if (v !== undefined && v !== null && v !== "")
      url.searchParams.set(k, String(v));
  }

  // Fetched outside the try below: a token failure means the payment was never sent.
  const token = await getToken();

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
    return request(method, path, { body, query }, true);
  }
  if (!res.ok) {
    throw new PayTraceError(`${method} ${path} returned HTTP ${res.status}`, {
      status: res.status,
      body: json,
    });
  }
  return json.data !== undefined ? json.data : json;
}

// ---- Result helpers --------------------------------------------------------------

/** The one check that decides whether to deliver goods or unlock access. */
function isApproved(result) {
  return (
    [101, 165].includes(Number(result?.response_code)) ||
    String(result?.status || "").toLowerCase() === "approved"
  );
}

function describe(result) {
  const code = result?.response_code;
  return `${code ?? "?"} ${CODES[code] || result?.response_message || ""}`.trim();
}

// ---- Protect.js (browser-tokenized cards, lightest PCI scope) -----------------

/** Short-lived (20 min) key the browser passes to PTPayment.setup(). */
async function getProtectClientKey() {
  const d = await request("POST", "/v3/payment-fields/token");
  const key = d.clientKey || d.client_key || d.token;
  if (!key)
    throw new PayTraceError(
      "No clientKey in /v3/payment-fields/token response",
      { body: d },
    );
  return key;
}

function protectFields({ hpfToken, encKey }) {
  return {
    [config.protectTokenField]: hpfToken,
    [config.protectKeyField]: encKey,
  };
}

/** Charge a card tokenized by Protect.js. */
function saleWithProtect({ hpfToken, encKey, amount, invoiceNumber }) {
  return request("POST", "/v3/card/sale/pt-protect", {
    body: {
      merchant_id: config.merchantId,
      amount,
      invoice_number: invoiceNumber,
      ...protectFields({ hpfToken, encKey }),
    },
  });
}

/** Charge a Protect.js card and save it to the vault in one call. Returns customer_id. */
function saleWithProtectAndSaveCard({
  hpfToken,
  encKey,
  amount,
  invoiceNumber,
}) {
  return request("POST", "/v3/card/sale/pt-protect/customer", {
    body: {
      merchant_id: config.merchantId,
      amount,
      invoice_number: invoiceNumber,
      ...protectFields({ hpfToken, encKey }),
    },
  });
}

// ---- Vault (saved cards: repeat and recurring billing) ------------------------

function saleByCustomer({ customerId, amount, invoiceNumber }) {
  return request("POST", `/v3/card/sale/customer/${customerId}`, {
    body: {
      merchant_id: config.merchantId,
      amount,
      invoice_number: invoiceNumber,
    },
  });
}

function authorizeByCustomer({ customerId, amount, invoiceNumber }) {
  return request("POST", `/v3/card/authorize/customer/${customerId}`, {
    body: {
      merchant_id: config.merchantId,
      amount,
      invoice_number: invoiceNumber,
    },
  });
}

// ---- Follow-up actions ---------------------------------------------------------

/** Turn authorizations into sales. Omitting an amount captures the authorized amount. */
function capture(transactionIds) {
  return request("POST", "/v3/card/batch/capture", {
    body: { transaction_ids: transactionIds.map(String) },
  });
}

/** Cancel transactions that haven't settled yet. After settlement, refund instead. */
function voidTransactions(transactionIds) {
  return request("POST", "/v3/card/batch/void", {
    body: { transaction_ids: transactionIds.map(String) },
  });
}

/** Refund a settled transaction. Path follows the V3 pattern; confirm it in the redoc. */
function refundByTransaction({ transactionId, amount }) {
  return request("POST", `/v3/card/refund/by-transaction/${transactionId}`, {
    body: { merchant_id: config.merchantId, amount },
  });
}

// ---- Lookups --------------------------------------------------------------------

function getTransaction(transactionId) {
  return request("GET", `/v3/card/transaction/${transactionId}`, {
    query: { merchant_id: config.merchantId },
  });
}

function listVoidable({ searchTerm, orderId, limit = 50 } = {}) {
  return request("GET", `/v3/card/transactions/voidable/${config.merchantId}`, {
    query: { search_term: searchTerm, order_id: orderId, limit },
  });
}

function listCapturable({ searchTerm, orderId, limit = 50 } = {}) {
  return request(
    "GET",
    `/v3/card/transactions/capturable/${config.merchantId}`,
    {
      query: { search_term: searchTerm, order_id: orderId, limit },
    },
  );
}

/**
 * After a timeout, look for an unsettled transaction carrying this invoice number.
 * Confirm with PayTrace which filter (search_term or order_id) matches invoice_number.
 */
async function findUnsettledByInvoice(invoiceNumber) {
  const lists = await Promise.all([
    listVoidable({ searchTerm: invoiceNumber }),
    listCapturable({ searchTerm: invoiceNumber }),
  ]);
  const rows = lists.flatMap((l) =>
    Array.isArray(l) ? l : l?.transactions || [],
  );
  return (
    rows.find(
      (t) =>
        String(t.invoice_number ?? t.invoice ?? "") === String(invoiceNumber),
    ) || null
  );
}

module.exports = {
  config,
  CODES,
  PayTraceError,
  getToken,
  request,
  isApproved,
  describe,
  getProtectClientKey,
  saleWithProtect,
  saleWithProtectAndSaveCard,
  saleByCustomer,
  authorizeByCustomer,
  capture,
  voidTransactions,
  refundByTransaction,
  getTransaction,
  listVoidable,
  listCapturable,
  findUnsettledByInvoice,
};
