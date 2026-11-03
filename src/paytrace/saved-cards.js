// Vault: charge cards saved under a customer ID (repeat and recurring billing).

const { config } = require("./config");
const { request } = require("./client");

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

module.exports = { saleByCustomer, authorizeByCustomer };
