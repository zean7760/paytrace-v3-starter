# PayTrace V3 starter

Starter code for integrating the PayTrace V3 API: a reusable server-side client,
a Protect.js checkout, and short scripts for the most common payment flows.
Built for the sandbox; see "Going to production" before using it with real cards.

## Quickstart

Requires Node 20.6 or newer.

    cp .env.example .env     # add your sandbox credentials
    npm install
    npm run smoke            # checks credentials and the API calls
    npm start                # checkout at http://localhost:3000

Test card: Visa 4012000098765439, exp 12/35, CSC 999.
The checkout charges one item, "Sample product" at $0.50. Change it in `PRODUCTS` in `src/server.js`.

## First call without any code

Every V3 request starts with a Bearer token. The token endpoint takes a **form-encoded** body;
a JSON body is read as missing credentials and returns `401 Invalid Credentials`.

    curl -X POST https://api.sandbox.paytrace.com/v3/token \
      -H "Content-Type: application/x-www-form-urlencoded" \
      -H "X-Integrator-Id: YOUR_INTEGRATOR_ID" \
      --data-urlencode grant_type=client_credentials \
      --data-urlencode client_id=YOUR_API_USER \
      --data-urlencode client_secret=YOUR_PASSWORD

Every other V3 call takes JSON. Send the token on each one, with your integrator ID:

    Authorization: Bearer <access_token>
    X-Integrator-Id: <integrator_id>

## What's in here

| File | What it shows |
| --- | --- |
| `src/paytrace/index.js` | The client's single entry point: `require('./paytrace')` |
| `src/paytrace/client.js` | Token caching, headers, error handling (`PayTraceError`) |
| `src/paytrace/results.js` | `isApproved` (the approval gate) and result summaries |
| `src/paytrace/protect.js` | Protect.js client key and card charges |
| `src/paytrace/saved-cards.js` | Charges against vaulted customers |
| `src/paytrace/transactions.js` | Capture, void, refund, and transaction lookups |
| `src/paytrace/config.js` | Settings read from `.env` |
| `src/server.js` | A checkout backend: approval gate, timeout recovery, optional saved card |
| `public/index.html` | Checkout markup: order summary and the Protect.js card fields |
| `public/checkout.js` | Checkout logic and card-field styles; card data never touches your page or server |
| `public/styles.css` | Page styles (not the card fields; see "Styling the card fields") |
| `examples/01-get-token.js` | Confirms credentials work |
| `examples/02-charge-saved-card.js` | Charges a vaulted card by customer ID (repeat and monthly billing) |
| `examples/03-authorize-capture-void.js` | Hold now, capture on shipment, or void to cancel |
| `examples/smoke-test.js` | Runs every flow against the sandbox and reports pass/fail |

To run the vault examples, complete one checkout with **Save card** ticked,
copy the customer ID it shows into `CUSTOMER_ID` in `.env`, then:

    npm run example:vault
    npm run example:auth-capture          # or: npm run example:auth-capture -- void

## How a checkout works

1. The page asks your server for a Protect `clientKey` (valid 20 minutes).
2. Your server gets it with its Bearer token (valid about 2 hours). Credentials stay on the server.
3. Protect.js renders PayTrace-hosted card fields, then returns a one-time token pair.
4. Your server charges that token pair.
5. **Deliver or unlock only when the response is approved.**

After step 3 the card fields are replaced by "Payment method: Visa ending in 5439". That is
Protect.js by design: each token pair is single-use. `PTPayment.reset()` brings the empty fields back.

## Styling the card fields

The card fields render inside PayTrace's iframe, so `styles.css` can't reach them. Style them
through `PT_STYLES` in `public/checkout.js`, which is passed to `PTPayment.setup()`:

- Groups: `cc`, `exp`, `code` (security code), `body`.
- Keys are PayTrace's snake_case names, not CSS: `height`, `width`, `font_color`, `font_size`,
  `input_font`, `border_color`, `border_style`, `input_border_width`, `input_border_radius`,
  `input_padding`, `background_color`, `label_color`, `label_size`, `label_font`,
  `label_font_weight`, `label_margin`, `padding_bottom`. Unknown keys are silently ignored.
- `raw` is a CSS string injected into the iframe as-is, for anything the keys can't express
  (`:focus`, `box-sizing`, select arrows). Field ids: `#credit_card`, `#expiration_month`,
  `#expiration_year`, `#security_code`.
- `PTPayment.style({...})` changes styles later; `PTPayment.theme(...)` sets label placement
  (`'above the line'`, `'horizontal'`, `'below the line'`).
- **The iframe never resizes to fit its content.** Its height comes from `#pt_hpf_form` in
  `styles.css`; raise it whenever you change field sizes or spacing.

These key names were read from the sandbox iframe's code, not from PayTrace's docs, and may change.

## Patterns worth copying

- **Approval gate.** `isApproved()` is the only thing that decides whether the customer gets the product.
- **Prices come from the server.** The browser sends a product ID, never an amount.
- **Your order ID goes in `invoice_number`.** After a timeout there's no transaction ID,
  so the server searches unsettled transactions for that invoice number before retrying.
- **Long timeouts.** Authorizations take a few seconds; the client waits 30 seconds.
- **Void before settlement, refund after.**

## Not yet verified against the live API

Confirm these with `npm run smoke` and a sandbox checkout:

- Whether the transaction list filters (`search_term`, `order_id`) match `invoice_number`.
- The refund-by-transaction path.
- How to trigger a decline in the V3 sandbox. $0.20 (documented as a decline amount) and
  $0.29 were both approved when tested, so the decline path is untested.
- Whether declines come back as HTTP 200 with code 102 or as an HTTP error.
- An endpoint to save a card without charging it. Today a card is saved only together with a
  sale (`/v3/card/sale/pt-protect/customer`).

Verified in the sandbox: the token request, the Protect `clientKey`, and Protect sales with the
default body fields `hpf_token` and `enc_key`.

## Known gaps

- After a payment the Pay button re-enables while the card fields show the masked card.
  Call `PTPayment.reset()` after a decline and hide the button after an approval.
- Saved cards can be charged only from `examples/02-charge-saved-card.js`. A UI for it needs
  user accounts, so the server looks up the customer's own `customer_id`; never accept one
  from the browser.

## Going to production

- Switch `PT_BASE_URL` to `https://api.paytrace.com` and the Protect.js script to
  `https://protect.paytrace.com/js/protect.min.js`.
- Store credentials in a secrets manager, not a `.env` file.
- Serve the checkout over HTTPS.
- Persist `transaction_id` (or `transaction_uuid` with the `X-Permalinks: true` header) with each order.
- Decide what to do with address and CVV mismatches before shipping high-value orders.
