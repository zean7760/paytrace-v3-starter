// Reading transaction results: the approval gate and a log-friendly summary.

// Response codes worth naming. Anything else: read response_message.
const CODES = {
  101: "approved",
  102: "declined",
  109: "voided",
  160: "customer created",
  165: "approved and customer created",
};

/** The one check that decides whether to deliver goods or unlock access. */
function isApproved(result) {
  return (
    [101, 165].includes(Number(result?.response_code)) ||
    String(result?.status || "").toLowerCase() === "approved"
  );
}

function describe(result) {
  const code = result?.response_code;
  return `${code ?? "?"} ${CODES[code] || result?.response_message || ""}`.trim();
}

module.exports = { CODES, isApproved, describe };
