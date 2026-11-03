// Runs each step against your sandbox and reports pass/fail.
// Use it to confirm the unverified request fields before showing the kit to a client.
const pt = require('../src/paytrace');

const steps = [];
const step = (name, fn, { needsCustomer } = {}) => steps.push({ name, fn, needsCustomer });
const customerId = process.env.CUSTOMER_ID;
let authId, saleId;

step('Get token', () => pt.getAccessToken().then(() => 'ok'));
step('Get Protect clientKey', () => pt.getProtectClientKey().then((k) => `ok (${String(k).slice(0, 8)}…)`));
step('List voidable', () => pt.listVoidableTransactions({ limit: 5 }).then((r) => `ok (${(r.length ?? r?.transactions?.length ?? '?')} rows)`));
step('Authorize saved card $0.50', async () => {
  const r = await pt.authorizeSavedCard({ customerId, amount: 0.5, invoiceNumber: `SMOKE-A-${Date.now()}` });
  authId = r.transaction_id; return pt.describeResult(r);
}, { needsCustomer: true });
step('Capture that authorization', async () => JSON.stringify(await pt.captureAuthorizations([authId])), { needsCustomer: true });
step('Sale on saved card $0.50', async () => {
  const r = await pt.chargeSavedCard({ customerId, amount: 0.5, invoiceNumber: `SMOKE-S-${Date.now()}` });
  saleId = r.transaction_id; return pt.describeResult(r);
}, { needsCustomer: true });
step('Void that sale', async () => JSON.stringify(await pt.voidTransactions([saleId])), { needsCustomer: true });

(async () => {
  let failed = 0;
  for (const s of steps) {
    if (s.needsCustomer && !customerId) { console.log(`SKIP  ${s.name} (set CUSTOMER_ID)`); continue; }
    try { console.log(`PASS  ${s.name}: ${await s.fn()}`); }
    catch (e) { failed++; console.log(`FAIL  ${s.name}: ${e.message}\n      ${JSON.stringify(e.body ?? '')}`); }
  }
  process.exit(failed ? 1 : 0);
})();
