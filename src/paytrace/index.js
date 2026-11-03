/**
 * Minimal PayTrace V3 client. Callers use this one entry point:
 *   const pt = require("./paytrace");
 *
 *   config.js        environment settings
 *   client.js        token cache, request wrapper, PayTraceError
 *   results.js       approval gate and result summaries
 *   protect.js       Protect.js client key and card charges
 *   saved-cards.js   charges against vaulted customers
 *   transactions.js  capture, void, refund, and lookups
 *
 * Runs on the server only. Never ship credentials or Bearer tokens to a browser.
 */

module.exports = {
  ...require("./config"),
  ...require("./client"),
  ...require("./results"),
  ...require("./protect"),
  ...require("./saved-cards"),
  ...require("./transactions"),
};
