// Ship-later flow: authorize now (hold funds), capture when shipping, or void to cancel.
const pt = require('../src/paytrace');

const customerId = process.env.CUSTOMER_ID;
if (!customerId) { console.error('Set CUSTOMER_ID in .env first.'); process.exit(1); }
const mode = process.argv[2] || 'capture'; // "capture" or "void"

(async () => {
  const auth = await pt.authorizeByCustomer({ customerId, amount: 0.5, invoiceNumber: `AUTH-${Date.now()}` });
  console.log('Authorize:', pt.describe(auth), '· transaction_id', auth.transaction_id);
  if (!pt.isApproved(auth)) return;

  if (mode === 'void') {
    const v = await pt.voidTransactions([auth.transaction_id]);
    console.log('Void (out of stock / cancelled before settlement):', JSON.stringify(v));
  } else {
    const c = await pt.capture([auth.transaction_id]);
    console.log('Capture (order shipped):', JSON.stringify(c));
  }
})().catch((e) => { console.error(e.message, JSON.stringify(e.body ?? '', null, 2)); process.exit(1); });
