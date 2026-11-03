// Step one of any integration: prove the credentials work.
const pt = require('../src/paytrace');

pt.getAccessToken()
  .then((t) => console.log(`Token OK (${t.slice(0, 12)}…). Cached for about 2 hours.`))
  .catch((e) => { console.error(e.message, e.body ?? ''); process.exit(1); });
