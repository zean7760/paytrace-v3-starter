// Vault: charge cards saved under a customer ID (repeat and recurring billing).

const { config } = require("./config");
const { apiRequest } = require("./client");

function chargeSavedCard({ customerId, amount, invoiceNumber }) {
  return apiRequest("POST", `/v3/card/sale/customer/${customerId}`, {
    body: {
      merchant_id: config.merchantId,
      amount,
      invoice_number: invoiceNumber,
    },
  });
}

function authorizeSavedCard({ customerId, amount, invoiceNumber }) {
  return apiRequest("POST", `/v3/card/authorize/customer/${customerId}`, {
    body: {
      merchant_id: config.merchantId,
      amount,
      invoice_number: invoiceNumber,
    },
  });
}

module.exports = { chargeSavedCard, authorizeSavedCard };
