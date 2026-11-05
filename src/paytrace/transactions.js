// Acting on existing transactions (capture, void, refund) and looking them up.

const { config } = require("./config");
const { apiRequest } = require("./client");

// ---- Follow-up actions ---------------------------------------------------------

// Batch endpoints take { merchant_id, batch_items: [{ transaction_id }] } (V3 OpenAPI spec).
const batchBody = (transactionIds) => ({
  merchant_id: config.merchantId,
  batch_items: transactionIds.map((id) => ({ transaction_id: String(id) })),
});

/** Turn authorizations into sales, each for its full authorized amount. */
function captureAuthorizations(transactionIds) {
  return apiRequest("POST", "/v3/card/batch/capture", {
    body: batchBody(transactionIds),
  });
}

/** Cancel transactions that haven't settled yet. After settlement, refund instead. */
function voidTransactions(transactionIds) {
  return apiRequest("POST", "/v3/card/batch/void", {
    body: batchBody(transactionIds),
  });
}

/** Refund a settled transaction. Path follows the V3 pattern; confirm it in the redoc. */
function refundTransaction({ transactionId, amount }) {
  return apiRequest("POST", `/v3/card/refund/by-transaction/${transactionId}`, {
    body: { merchant_id: config.merchantId, amount },
  });
}

// ---- Lookups --------------------------------------------------------------------

function getTransaction(transactionId) {
  return apiRequest("GET", `/v3/card/transaction/${transactionId}`, {
    query: { merchant_id: config.merchantId },
  });
}

function listVoidableTransactions({ searchTerm, orderId, limit = 50 } = {}) {
  return apiRequest("GET", `/v3/card/transactions/voidable/${config.merchantId}`, {
    query: { search_term: searchTerm, order_id: orderId, limit },
  });
}

function listCapturableTransactions({ searchTerm, orderId, limit = 50 } = {}) {
  return apiRequest(
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
    listVoidableTransactions({ searchTerm: invoiceNumber }),
    listCapturableTransactions({ searchTerm: invoiceNumber }),
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
  captureAuthorizations,
  voidTransactions,
  refundTransaction,
  getTransaction,
  listVoidableTransactions,
  listCapturableTransactions,
  findUnsettledByInvoice,
};
