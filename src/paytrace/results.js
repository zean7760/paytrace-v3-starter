// Reading transaction results: the approval gate and a log-friendly summary.

// Response codes worth naming. Anything else: read response_message.
const RESPONSE_CODES = {
  101: "approved",
  102: "declined",
  109: "voided",
  160: "customer created",
  165: "approved and customer created",
  // The card WAS charged; only saving it failed. Must count as approved, or the
  // customer is told the payment failed after being charged.
  167: "approved, but customer not created",
};

/** The one check that decides whether to deliver goods or unlock access. */
function isApproved(result) {
  return (
    [101, 165, 167].includes(Number(result?.response_code)) ||
    String(result?.status || "").toLowerCase() === "approved"
  );
}

function describeResult(result) {
  const code = result?.response_code;
  return `${code ?? "?"} ${RESPONSE_CODES[code] || result?.response_message || ""}`.trim();
}

module.exports = { RESPONSE_CODES, isApproved, describeResult };
