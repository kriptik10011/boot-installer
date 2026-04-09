/**
 * Emergency restoration script for transactions after test timeout.
 * Run with: node e2e/restore-transactions.mjs
 */

import { readFileSync } from 'fs';
import http from 'http';

function request(method, path, token, data) {
  return new Promise((resolve, reject) => {
    const body = data ? JSON.stringify(data) : null;
    const opts = {
      hostname: 'localhost',
      port: 8000,
      path,
      method,
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
    };
    if (body) opts.headers['Content-Length'] = Buffer.byteLength(body);

    const req = http.request(opts, (res) => {
      let d = '';
      res.on('data', (c) => (d += c));
      res.on('end', () => resolve({ status: res.statusCode, body: d }));
    });
    req.on('error', reject);
    if (body) req.write(body);
    req.end();
  });
}

async function login() {
  const res = await request('POST', '/api/auth/login', '', {
    user_id: '3cdfaf677344608d28c467c99bf9d331',
    pin: '1234',
  });
  return JSON.parse(res.body).token;
}

async function main() {
  console.log('Restoring transactions...');
  const token = await login();
  console.log(`Got token: ${token.slice(0, 8)}...`);

  const saved = JSON.parse(
    readFileSync('e2e/screenshots/empty-states/saved-transactions.json', 'utf8')
  );
  console.log(`Found ${saved.length} transactions to restore`);

  let ok = 0;
  let fail = 0;

  for (const tx of saved) {
    const payload = {
      description: tx.description,
      amount: tx.amount,
      date: tx.date,
      is_income: tx.is_income ?? false,
    };
    if (tx.category_id) payload.category_id = tx.category_id;
    if (tx.merchant) payload.merchant = tx.merchant;
    if (tx.payment_method) payload.payment_method = tx.payment_method;
    if (tx.notes) payload.notes = tx.notes;
    if (tx.is_recurring !== undefined) payload.is_recurring = tx.is_recurring;
    if (tx.income_source_id) payload.income_source_id = tx.income_source_id;

    try {
      // POST to /api/transactions/ (with trailing slash to avoid 307 redirect)
      const res = await request('POST', '/api/transactions/', token, payload);
      if (res.status >= 200 && res.status < 300) {
        ok++;
        console.log(`  RESTORED: "${tx.description}" (${tx.date})`);
      } else {
        fail++;
        console.error(`  FAILED ${res.status}: "${tx.description}" — ${res.body}`);
      }
    } catch (e) {
      fail++;
      console.error(`  ERROR: "${tx.description}" — ${e.message}`);
    }
  }

  console.log(`\nDone: ${ok} restored, ${fail} failed`);

  // Verify
  const check = await request('GET', '/api/transactions', token, null);
  const current = JSON.parse(check.body || '[]');
  console.log(`Current transaction count: ${Array.isArray(current) ? current.length : '?'}`);
}

main().catch(console.error);
