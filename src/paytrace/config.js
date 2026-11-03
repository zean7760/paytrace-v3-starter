// Settings read once from the environment at startup.

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

module.exports = { config };
