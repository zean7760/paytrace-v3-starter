// Protect.js: cards tokenized in the browser by PayTrace's iframe (lightest PCI scope).

const { config } = require("./config");
const { PayTraceError, apiRequest } = require("./client");

/** Short-lived (20 min) key the browser passes to PTPayment.setup(). */
async function getProtectClientKey() {
  const d = await apiRequest("POST", "/v3/payment-fields/token");
  const key = d.clientKey || d.client_key || d.token;
  if (!key)
    throw new PayTraceError(
      "No clientKey in /v3/payment-fields/token response",
      { body: d },
    );
  return key;
}

// The token pair from PTPayment.process() goes in the sale body as hpf_token and
// enc_key, the same names Protect.js returns (confirmed by approved sandbox sales).

/** Charge a card tokenized by Protect.js. */
function chargeProtectCard({ hpfToken, encKey, amount, invoiceNumber }) {
  return apiRequest("POST", "/v3/card/sale/pt-protect", {
    body: {
      merchant_id: config.merchantId,
      amount,
      invoice_number: invoiceNumber,
      hpf_token: hpfToken,
      enc_key: encKey,
    },
  });
}

/** Charge a Protect.js card and save it to the vault in one call. Returns customer_id. */
function chargeAndSaveProtectCard({
  hpfToken,
  encKey,
  amount,
  invoiceNumber,
}) {
  return apiRequest("POST", "/v3/card/sale/pt-protect/customer", {
    body: {
      merchant_id: config.merchantId,
      amount,
      invoice_number: invoiceNumber,
      hpf_token: hpfToken,
      enc_key: encKey,
    },
  });
}

module.exports = {
  getProtectClientKey,
  chargeProtectCard,
  chargeAndSaveProtectCard,
};
