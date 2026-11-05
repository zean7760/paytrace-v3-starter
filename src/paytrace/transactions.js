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

/** Refund a settled transaction, in full or in part (amount). Before settlement, void instead. */
function refundTransaction({ transactionId, amount }) {
  return apiRequest(
    "POST",
    `/v3/card/refund-auth/by-transaction/${transactionId}`,
    { body: { merchant_id: config.merchantId, amount } },
  );
}

// ---- Lookups --------------------------------------------------------------------

function getTransaction(transactionId) {
  return apiRequest("GET", `/v3/card/transaction/${transactionId}`, {
    query: { merchant_id: config.merchantId },
  });
}

function listVoidableTransactions({ searchTerm, limit = 50 } = {}) {
  return apiRequest("GET", `/v3/card/transactions/voidable/${config.merchantId}`, {
    query: { search_term: searchTerm, limit },
  });
}

function listCapturableTransactions({ searchTerm, limit = 50 } = {}) {
  return apiRequest(
    "GET",
    `/v3/card/transactions/capturable/${config.merchantId}`,
    {
      query: { search_term: searchTerm, limit },
    },
  );
}

/**
 * After a timeout, look for an unsettled transaction carrying this invoice number.
 * search_term finds invoice_number (verified in sandbox) but returns loose matches too
 * (8 rows for one invoice in testing), so the exact comparison below is required.
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
