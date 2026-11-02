// Založí Supabase projekt pre Poruke (alebo použije existujúci), spustí schema.sql a seed.sql a vypíše verejný kľúč.
// Token (Personal Access Token, sbp_…) sa číta z premennej SUPABASE_ACCESS_TOKEN alebo zo súboru ~/.poruke/supabase-token,
// nikdy nie z repozitára. Heslo databázy sa vygeneruje a uloží do ~/.poruke/db-password (nie je potrebné pre web).
// Použitie: node supabase/provision.js [--ref <project-ref>] [--only-sql] [--keys]
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');

const API = 'https://api.supabase.com/v1';
const HOME = path.join(os.homedir(), '.poruke');
const token = (process.env.SUPABASE_ACCESS_TOKEN || (fs.existsSync(path.join(HOME, 'supabase-token')) ? fs.readFileSync(path.join(HOME, 'supabase-token'), 'utf8') : '')).trim();
if (!/^sbp_[A-Za-z0-9_]+$/.test(token)) throw new Error('Chýba token: SUPABASE_ACCESS_TOKEN alebo ~/.poruke/supabase-token (sbp_…)');
const arg = k => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : null; };

const api = async (p, opts = {}) => {
  const res = await fetch(API + p, { ...opts, headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', ...(opts.headers || {}) } });
  const text = await res.text();
  let body; try { body = text ? JSON.parse(text) : null; } catch { body = text; }
  if (!res.ok) throw new Error(`${opts.method || 'GET'} ${p} -> ${res.status} ${typeof body === 'string' ? body : JSON.stringify(body)}`);
  return body;
};
const sleep = ms => new Promise(r => setTimeout(r, ms));
const sql = (ref, query) => api(`/projects/${ref}/database/query`, { method: 'POST', body: JSON.stringify({ query }) });

(async () => {
  let ref = arg('--ref');
  if (!ref) {
    const projects = await api('/projects');
    const found = projects.find(p => p.name === 'poruke');
    if (found) {
      ref = found.id || found.ref;
      console.log(`Projekt poruke už existuje: ${ref} (${found.region}, ${found.status})`);
    } else {
      const orgs = await api('/organizations');
      if (!orgs.length) throw new Error('Účet nemá žiadnu organizáciu');
      const org = orgs[0];
      fs.mkdirSync(HOME, { recursive: true });
      const pass = crypto.randomBytes(24).toString('base64url');
      fs.writeFileSync(path.join(HOME, 'db-password'), pass, { mode: 0o600 });
      const p = await api('/projects', {
        method: 'POST',
        body: JSON.stringify({ name: 'poruke', organization_id: org.id, region: 'eu-central-1', db_pass: pass })
      });
      ref = p.id || p.ref;
      console.log(`Založený projekt poruke: ${ref} v organizácii ${org.name} (Frankfurt)`);
    }
  }
  // počkať, kým projekt nabehne
  for (let k = 0; k < 60; k++) {
    const p = await api(`/projects/${ref}`);
    if (p.status === 'ACTIVE_HEALTHY') break;
    if (k === 0 || k % 6 === 0) console.log(`  stav projektu: ${p.status}, čakám…`);
    await sleep(10000);
  }
  if (!process.argv.includes('--keys')) {
    for (const f of ['schema.sql', 'seed.sql']) {
      await sql(ref, fs.readFileSync(path.join(__dirname, f), 'utf8'));
      console.log(`  ${f} spustené`);
    }
    const n = await sql(ref, 'select (select count(*) from public.majstri) majstri, (select count(*) from public.fotky_realizacii) fotky, (select count(*) from public.hodnotenia) hodnotenia');
    console.log('  v databáze:', JSON.stringify(n));
  }
  if (process.argv.includes('--only-sql')) return;
  const keys = await api(`/projects/${ref}/api-keys?reveal=false`);
  const anon = keys.find(k => k.name === 'anon' || k.type === 'publishable');
  console.log(JSON.stringify({ url: `https://${ref}.supabase.co`, anon: anon && anon.api_key, keys: keys.map(k => `${k.name}/${k.type || 'legacy'}`) }));
})().catch(e => { console.error(String(e.message || e)); process.exit(1); });
