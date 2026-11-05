// Settings read once from the environment at startup.

const config = {
  baseUrl: process.env.PT_BASE_URL,
  username: process.env.PT_USERNAME,
  password: process.env.PT_PASSWORD,
  integratorId: process.env.PT_INTEGRATOR_ID, //request your integrator ID from PayTrace;
  merchantId: Number(process.env.PT_MERCHANT_ID),
  timeoutMs: 30_000, // Authorizations take a few seconds; never use a short timeout.
};

// No default on purpose: a forgotten value must not silently hit sandbox or production.
// Checked at load so a missing or malformed URL stops startup with this message,
// instead of surfacing later as a misleading "request failed" network error.
if (!URL.canParse(config.baseUrl ?? "")) {
  throw new Error(
    "PT_BASE_URL must be set to a full URL. Sandbox: https://api.sandbox.paytrace.com" +
      " Production: https://api.paytrace.com",
  );
}

module.exports = { config };
