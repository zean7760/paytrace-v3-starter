// Charge a card saved in the vault: no card data needed, just the customer ID.
// This is the building block for repeat and monthly billing.
const pt = require('../src/paytrace');

const customerId = process.env.CUSTOMER_ID;
if (!customerId) {
  console.error('Set CUSTOMER_ID in .env. Get one by checking "Save card" in the starter checkout.');
  process.exit(1);
}

(async () => {
  const result = await pt.saleByCustomer({ customerId, amount: 0.5, invoiceNumber: `INV-${Date.now()}` });
  console.log(pt.isApproved(result) ? 'Approved' : 'Not approved', '→', pt.describe(result));
  console.log('transaction_id:', result.transaction_id);
})().catch((e) => { console.error(e.message, JSON.stringify(e.body ?? '', null, 2)); process.exit(1); });
