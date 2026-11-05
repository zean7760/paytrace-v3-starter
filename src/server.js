/**
 * Example backend for a Protect.js checkout.
 * The browser only ever receives the 20-minute Protect clientKey.
 */
const express = require("express");
const path = require("path");
const pt = require("./paytrace");

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, "..", "public")));

// In a real app the price comes from your catalog or order, never from the browser.
const PRODUCTS = {
  approve: { name: "Sample product", amount: 0.5 },
};

app.get("/api/products", (_req, res) => res.json(PRODUCTS));

app.get("/api/client-key", async (_req, res) => {
  try {
    res.json({ clientKey: await pt.getProtectClientKey() });
  } catch (e) {
    res.status(502).json({ error: e.message, paytrace: e.body });
  }
});

// Sandbox diagnostic: confirms the server can get a PayTrace token.
// Reports success only; the token itself must never reach the browser.
// A cached token (up to ~15 min old) counts as success without a new PayTrace call.
app.get("/api/token-check", async (_req, res) => {
  try {
    await pt.getAccessToken();
    res.json({ ok: true, message: "PayTrace token OK" });
  } catch (e) {
    res.status(502).json({ ok: false, error: e.message, status: e.status, paytrace: e.body });
  }
});

app.post("/api/checkout", async (req, res) => {
  const {
    hpf_token: hpfToken,
    enc_key: encKey,
    productId,
    saveCard,
  } = req.body || {};
  const product = PRODUCTS[productId];
  if (!hpfToken || !encKey || !product)
    return res.status(400).json({ error: "Invalid checkout request" });

  // Your own order ID, sent as invoice_number, lets you find this sale after a timeout.
  const invoiceNumber = `ORD-${Date.now()}`;
  const charge = saveCard ? pt.chargeAndSaveProtectCard : pt.chargeProtectCard;

  try {
    const result = await charge({
      hpfToken,
      encKey,
      amount: product.amount,
      invoiceNumber,
      // Used only when saving the card. PayTrace requires a label no other saved customer
      // has; a repeat label charges the card but skips saving it (code 167). Example
      // value: replace with your own unique reference, e.g. your user ID.
      customerLabel: `Example customer ${invoiceNumber}`,
    });
    const approved = pt.isApproved(result);
    console.log(`[checkout] ${invoiceNumber} ${pt.describeResult(result)}`);

    // This is the gate: deliver or unlock ONLY when approved.
    res.json({
      approved,
      invoiceNumber,
      message: approved
        ? "Payment approved"
        : result.response_message || "Payment declined",
      transactionId: result.transaction_id,
      customerId: result.customer_id,
      avs: result.avs_response,
      cvv: result.cvv_response,
      raw: result,
    });
  } catch (e) {
    if (e.outcomeUnknown) {
      // Timeout: don't tell the customer it failed, and don't retry blindly.
      const found = await pt
        .findUnsettledByInvoice(invoiceNumber)
        .catch(() => null);
      if (found)
        return res.json({
          approved: true,
          invoiceNumber,
          recoveredAfterTimeout: true,
          raw: found,
        });
      return res.status(504).json({
        error: "Payment status unknown; check before retrying",
        invoiceNumber,
      });
    }
    console.error(
      `[checkout] ${invoiceNumber} ${e.message}`,
      JSON.stringify(e.body),
    );
    res.status(e.status || 502).json({ error: e.message, paytrace: e.body });
  }
});

const port = Number(process.env.PORT || 3000);
app.listen(port, () =>
  console.log(`Starter checkout running on http://localhost:${port}`),
);
