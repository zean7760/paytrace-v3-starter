// Acting on existing transactions (capture, void, refund) and looking them up.

const { config } = require("./config");
const { request } = require("./client");

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
  capture,
  voidTransactions,
  refundByTransaction,
  getTransaction,
  listVoidable,
  listCapturable,
  findUnsettledByInvoice,
};
