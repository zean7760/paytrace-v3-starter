# PayTrace V3 starter

A server-side PayTrace V3 client, a Protect.js checkout, and scripts for the common payment
flows. Built for the sandbox; see "Going to production" before using real cards.

## Quickstart

Requires Node 20.6 or newer.

    cp .env.example .env     # add PT_BASE_URL and your sandbox credentials
    npm install
    npm run smoke            # checks credentials and the API calls
    npm start                # checkout at http://localhost:3000

Test card: Visa 4012000098765439, exp 12/35, CSC 999. The checkout charges "Sample product"
($0.50); change it in `PRODUCTS` in `src/server.js`. **Test PayTrace token** on the page
checks that the server can authenticate.

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

PayTrace publishes the full V3 API reference at https://api.sandbox.paytrace.com/v3/redoc
(machine-readable: `/v3/openapi.json`). Check request bodies and paths there.

## What's in here

| Path | What it is |
| --- | --- |
| `src/paytrace/` | The client: token caching, errors, and one function per API call. Copy it into your app. |
| `src/server.js` | Demo checkout backend: approval gate and timeout recovery |
| `public/` | Demo checkout page with the Protect.js card fields |
| `examples/` | Token check, saved-card charge, authorize/capture/void, and a smoke test |

To run the saved-card examples, complete one checkout with **Save card** ticked, copy the
customer ID it shows into `CUSTOMER_ID` in `.env`, then:

    npm run example:vault
    npm run example:auth-capture          # or: npm run example:auth-capture -- void

## How a checkout works

1. The page asks your server for a Protect `clientKey` (valid 20 minutes).
2. Your server gets it with its Bearer token (valid 15 minutes). Credentials stay on the server.
3. Protect.js renders PayTrace-hosted card fields, then returns a one-time token pair.
4. Your server charges that token pair.
5. **Deliver or unlock only when the response is approved.**

After step 3 the fields show the masked card by design; `PTPayment.reset()` brings them back.

## Styling the card fields

The fields render inside PayTrace's iframe, so `styles.css` can't reach them. Style them with
`PT_STYLES` in `public/checkout.js`; its comment lists every supported key. **The iframe never
resizes to fit its content:** raise `#pt_hpf_form`'s height in `styles.css` when fields grow.

## Patterns worth copying

- **Approval gate.** `isApproved()` is the only thing that decides whether the customer gets the product.
- **Prices come from the server.** The browser sends a product ID, never an amount.
- **Your order ID goes in `invoice_number`.** After a timeout there's no transaction ID,
  so the server searches unsettled transactions for that invoice number before retrying.
- **Long timeouts.** Authorizations take a few seconds; the client waits 30 seconds.
- **Void before settlement, refund after.**

## Going to production

- Switch `PT_BASE_URL` to `https://api.paytrace.com` and the Protect.js script to
  `https://protect.paytrace.com/js/protect.min.js`.
- Store credentials in a secrets manager, not a `.env` file.
- Serve the checkout over HTTPS.
- Remove the `/api/token-check` route: it's an unauthenticated diagnostic.
- Persist `transaction_id` (or `transaction_uuid` with the `X-Permalinks: true` header) with each order.
- Decide what to do with address and CVV mismatches before shipping high-value orders.
