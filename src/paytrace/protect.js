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

function protectFields({ hpfToken, encKey }) {
  return {
    [config.protectTokenField]: hpfToken,
    [config.protectKeyField]: encKey,
  };
}

/** Charge a card tokenized by Protect.js. */
function chargeProtectCard({ hpfToken, encKey, amount, invoiceNumber }) {
  return apiRequest("POST", "/v3/card/sale/pt-protect", {
    body: {
      merchant_id: config.merchantId,
      amount,
      invoice_number: invoiceNumber,
      ...protectFields({ hpfToken, encKey }),
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
      ...protectFields({ hpfToken, encKey }),
    },
  });
}

module.exports = {
  getProtectClientKey,
  chargeProtectCard,
  chargeAndSaveProtectCard,
};
