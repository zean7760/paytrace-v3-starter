// Checkout page logic. Loaded at the end of <body> in index.html, after protect.min.js,
// so the form elements and the PTPayment global both exist when this runs.
const $ = (id) => document.getElementById(id);
const btn = $('submit');

// Protect.js field styles. The fields live in PayTrace's iframe, so styles.css
// (including var(--...)) can't reach them; use literal values.
// Groups: cc, exp, code (security code), body. Keys are snake_case, not CSS names.
// Anything the keys can't express (e.g. :focus) goes in `raw`, a CSS string the
// iframe injects verbatim. Field ids there: #credit_card, #expiration_month,
// #expiration_year, #security_code.
const FIELD = {
  font_color: '#1b1d21', font_size: '16px', input_font: 'system-ui, sans-serif',
  border_color: '#dde0e6', border_style: 'solid', input_border_width: '1px',
  input_border_radius: '8px', input_padding: '0 12px', background_color: '#fff', height: '40px',
  label_color: '#1b1d21', label_size: '15px', label_font: 'system-ui, sans-serif', label_font_weight: '600',
  label_margin: '0 0 6px', padding_bottom: '16px',
};
const PT_STYLES = {
  cc: { ...FIELD, width: '100%' },
  exp: { ...FIELD, width: '96px' },
  code: { ...FIELD, width: '120px' },
  body: { background_color: 'transparent' },
  // border-box keeps width:100% + padding inside the iframe instead of overflowing its right edge.
  // The 4px margin leaves room for the focus outline, which the iframe would otherwise clip.
  raw: '* { box-sizing: border-box; } body { margin: 0; padding: 4px; }'
     + ' input:focus, select:focus { outline: 2px solid #1b1d21; outline-offset: 1px; }'
     // Custom arrow inset from the border; native select arrows ignore padding and hug it.
     + ` select { appearance: none; padding-right: 28px; cursor: pointer; background: #fff url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='8' viewBox='0 0 12 8'%3E%3Cpath d='M1 1.5l5 5 5-5' fill='none' stroke='%235b6170' stroke-width='1.6' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E") no-repeat right 10px center; }`,
};

function show(ok, text, raw) {
  $('status').className = 'status ' + (ok ? 'ok' : 'bad');
  $('status').textContent = text;
  if (raw !== undefined) $('raw').textContent = JSON.stringify(raw, null, 2);
}

// Sandbox diagnostic. The server reports success or PayTrace's error, never the token.
$('tokenCheck').addEventListener('click', async () => {
  const b = $('tokenCheck');
  b.disabled = true;
  try {
    const r = await fetch('/api/token-check');
    const j = await r.json();
    show(r.ok, r.ok ? j.message : `Token failed: ${j.error}`, j);
  } catch (err) {
    show(false, 'Could not reach the server', String(err));
  } finally {
    b.disabled = false;
  }
});

// Display only: the server charges its own PRODUCTS price for this id, never a browser amount.
let productId;

async function init() {
  const products = await (await fetch('/api/products')).json();
  const [id, p] = Object.entries(products)[0];
  productId = id;
  const price = `$${p.amount.toFixed(2)}`;
  $('itemName').textContent = p.name;
  $('itemPrice').textContent = price;
  $('total').textContent = price;
  // 1. Our server fetches a 20-minute clientKey; credentials never reach this page.
  const r = await fetch('/api/client-key');
  const j = await r.json();
  if (!r.ok) return show(false, 'Could not load the payment form', j);
  // 2. Protect.js renders the hosted card fields.
  await PTPayment.setup({ styles: PT_STYLES, authorization: { clientKey: j.clientKey } });
  PTPayment.theme('above the line'); // labels above inputs; also 'horizontal', 'below the line'
  btn.disabled = false;
  btn.textContent = 'Pay';
}

$('pay').addEventListener('submit', (e) => {
  e.preventDefault();
  btn.disabled = true;
  btn.textContent = 'Processing…';
  PTPayment.style({ cc: { border_color: FIELD.border_color } }); // clear a previous error highlight
  // 3. Validate inside the iframe, then tokenize. Card data never touches this page.
  PTPayment.validate((errors) => {
    if (errors.length) {
      btn.disabled = false; btn.textContent = 'Pay';
      // Protect.js validation errors use camelCase: [{ responseCode: '35', description }].
      if (errors.some((err) => err.responseCode == '35')) {
        PTPayment.style({ cc: { border_color: '#b42318' } });
      }
      return show(false, 'Please check the card details', errors);
    }
    pay();
  });
});

// After process() the iframe shows the masked card and its token pair is single-use.
// Re-enable Pay (with fresh fields) only when the card was certainly not charged.
function payAgain() {
  PTPayment.reset();
  btn.disabled = false;
  btn.textContent = 'Pay';
}

async function pay() {
  let m;
  try {
    const r = await PTPayment.process();
    m = r.message || r;
  } catch (err) {
    show(false, 'Could not tokenize the card. Reload if this page has been open over 20 minutes.', err);
    return payAgain(); // nothing was sent to PayTrace
  }

  let res, out;
  try {
    // 4. Send only the token pair and the product to our server.
    res = await fetch('/api/checkout', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ hpf_token: m.hpf_token, enc_key: m.enc_key,
                             productId, saveCard: $('saveCard').checked }),
    });
    out = await res.json();
  } catch (err) {
    // The request may have reached the server and charged the card: don't invite a retry.
    return show(false, 'No response from the server. Check your order before paying again.', String(err));
  }

  // 5. Only the server's "approved" decides what the customer gets.
  if (out.approved) {
    show(true, `Approved · invoice ${out.invoiceNumber}` + (out.customerId ? ` · saved as customer ${out.customerId}` : ''), out);
    btn.hidden = true; // paid: no second charge from this page
    return;
  }
  if (res.status === 504) {
    // Server says the outcome is unknown (PayTrace timeout): same rule, no retry.
    return show(false, out.error || 'Payment status unknown. Check your order before paying again.', out);
  }
  show(false, out.message || out.error || 'Payment failed', out);
  payAgain(); // declined or rejected: the card was not charged
}

init().catch((err) => show(false, 'Setup failed: ' + err.message));
