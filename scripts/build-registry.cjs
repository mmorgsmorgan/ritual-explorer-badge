#!/usr/bin/env node
/*
 * Build a contract registry for Ritual Chain dApps.
 *
 * Reads /tmp/ritual-dapps.csv (URL, Name, Owner), scrapes each dApp's
 * frontend HTML + JS bundles for 0x-prefixed 40-hex strings, then
 * validates them against Ritual Chain RPC via eth_getCode.
 *
 * Writes /home/chief/ritual-explorer-badge/data/registry.json.
 */

'use strict';

const fs = require('node:fs');
const path = require('node:path');

const CSV_PATH = '/tmp/ritual-dapps.csv';
const OUT_PATH = '/home/chief/ritual-explorer-badge/data/registry.json';
const RPC_URL = 'https://rpc.ritualfoundation.org';

const USER_AGENT =
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) ' +
  'Chrome/124.0.0.0 Safari/537.36';

const FETCH_TIMEOUT_MS = 10_000;
const MAX_SCRIPTS_PER_DAPP = 20;
const MAX_SCRIPT_BYTES = 2 * 1024 * 1024; // 2MB
const DAPP_CONCURRENCY = 8;
const RPC_BATCH_SIZE = 100;

// Common noise — known non-Ritual contracts, sentinels, etc.
const NOISE = new Set(
  [
    '0x0000000000000000000000000000000000000000',
    '0x000000000000000000000000000000000000dead',
    '0xffffffffffffffffffffffffffffffffffffffff',
    // ETH mainnet USDC
    '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48',
    // Base USDC
    '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913',
    // Arbitrum USDC
    '0xaf88d065e77c8cc2239327c5edb3a432268e5831',
    // Polygon USDC
    '0x3c499c542cef5e3811e1192ce70d8cc03d5c3359',
    // Optimism USDC
    '0x0b2c639c533813f4aa9d7837caf62653d097ff85',
    // Common ETH WETH on mainnet
    '0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2',
    // Common USDT on mainnet
    '0xdac17f958d2ee523a2206206994597c13d831ec7',
    // 0xdead variants seen often
    '0x000000000000000000000000000000000000d000',
  ].map((s) => s.toLowerCase())
);

const ADDR_RE = /0x[a-fA-F0-9]{40}/g;

// ---------- CSV parsing ----------

function parseCsv(text) {
  // Strip BOM
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
  const lines = text.split(/\r?\n/).filter((l) => l.length > 0);
  // skip header
  const rows = [];
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];
    // Simple split — no quoted fields appear in this CSV. If a quoted field
    // ever appears, fall back to a tolerant parser.
    const cols = simpleCsvSplit(line);
    if (cols.length < 3) continue;
    let url = (cols[0] || '').trim();
    const name = (cols[1] || '').trim();
    const owner = (cols[2] || '').trim();
    if (!url) continue;
    if (!/^https?:\/\//i.test(url)) url = 'https://' + url;
    rows.push({ url, name, owner });
  }
  return rows;
}

function simpleCsvSplit(line) {
  // Handle a minimal subset: split on commas, but respect double-quote spans.
  const out = [];
  let cur = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"' && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else if (ch === '"') {
        inQuotes = false;
      } else {
        cur += ch;
      }
    } else {
      if (ch === ',') {
        out.push(cur);
        cur = '';
      } else if (ch === '"') {
        inQuotes = true;
      } else {
        cur += ch;
      }
    }
  }
  out.push(cur);
  return out;
}

// ---------- Fetch helpers ----------

async function fetchWithTimeout(url, opts = {}) {
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      ...opts,
      redirect: 'follow',
      signal: controller.signal,
      headers: {
        'user-agent': USER_AGENT,
        accept:
          'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'accept-language': 'en-US,en;q=0.9',
        ...(opts.headers || {}),
      },
    });
    return res;
  } finally {
    clearTimeout(t);
  }
}

async function fetchText(url, maxBytes = MAX_SCRIPT_BYTES, retries = 2) {
  let lastErr;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const res = await fetchWithTimeout(url);
      if (!res.ok) {
        // 4xx is unlikely to recover; throw immediately.
        // 5xx and transport errors get retried.
        if (res.status >= 400 && res.status < 500) {
          throw new Error(`HTTP ${res.status}`);
        }
        throw new Error(`HTTP ${res.status}`);
      }
      const buf = Buffer.from(await res.arrayBuffer());
      const slice = buf.length > maxBytes ? buf.subarray(0, maxBytes) : buf;
      return slice.toString('utf8');
    } catch (err) {
      lastErr = err;
      // Don't retry on 4xx
      if (/HTTP 4\d\d/.test(err.message || '')) throw err;
      if (attempt < retries) {
        await new Promise((r) => setTimeout(r, 750 * (attempt + 1)));
        continue;
      }
      throw err;
    }
  }
  throw lastErr;
}

// ---------- HTML / JS extraction ----------

function extractScriptSrcs(html, baseUrl) {
  const out = [];
  const re = /<script[^>]+src=["']([^"']+)["']/gi;
  let m;
  while ((m = re.exec(html))) {
    try {
      const abs = new URL(m[1], baseUrl).toString();
      out.push(abs);
    } catch {
      /* ignore bad URLs */
    }
  }
  return out;
}

function extractInlineScripts(html) {
  const out = [];
  const re = /<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/gi;
  let m;
  while ((m = re.exec(html))) {
    out.push(m[1]);
  }
  return out;
}

function extractAddresses(text) {
  const set = new Set();
  const m = text.match(ADDR_RE);
  if (!m) return set;
  for (const raw of m) {
    const a = raw.toLowerCase();
    if (NOISE.has(a)) continue;
    set.add(a);
  }
  return set;
}

// ---------- Per-dApp scrape ----------

async function scrapeDapp(dapp) {
  const result = {
    url: dapp.url,
    name: dapp.name,
    owner: dapp.owner,
    contracts: [],
    candidatesFound: 0,
    scrapeError: null,
    _candidates: new Set(), // internal; stripped before write
  };

  let html;
  try {
    html = await fetchText(dapp.url, MAX_SCRIPT_BYTES);
  } catch (err) {
    result.scrapeError = `fetch HTML: ${err.message || String(err)}`;
    return result;
  }

  const allText = [html];
  const inline = extractInlineScripts(html);
  for (const s of inline) allText.push(s);

  const srcs = extractScriptSrcs(html, dapp.url).slice(0, MAX_SCRIPTS_PER_DAPP);

  for (const src of srcs) {
    try {
      const body = await fetchText(src, MAX_SCRIPT_BYTES);
      allText.push(body);
    } catch {
      // ignore individual script failures
    }
  }

  const combined = allText.join('\n');
  const addrs = extractAddresses(combined);
  result._candidates = addrs;
  result.candidatesFound = addrs.size;
  return result;
}

// ---------- RPC validation ----------

async function batchEthGetCode(addresses) {
  // returns Map<addr, boolean> verified
  const out = new Map();
  for (let i = 0; i < addresses.length; i += RPC_BATCH_SIZE) {
    const slice = addresses.slice(i, i + RPC_BATCH_SIZE);
    const payload = slice.map((addr, idx) => ({
      jsonrpc: '2.0',
      id: i + idx,
      method: 'eth_getCode',
      params: [addr, 'latest'],
    }));
    let attempt = 0;
    let resp;
    while (true) {
      attempt++;
      try {
        const res = await fetch(RPC_URL, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(payload),
        });
        if (!res.ok) throw new Error(`RPC HTTP ${res.status}`);
        resp = await res.json();
        break;
      } catch (err) {
        if (attempt >= 3) {
          console.error(
            `[rpc] batch ${i / RPC_BATCH_SIZE} failed after retries: ${err.message}`
          );
          // mark all as unverified for this batch
          for (const a of slice) out.set(a, false);
          resp = null;
          break;
        }
        await new Promise((r) => setTimeout(r, 500 * attempt));
      }
    }
    if (!resp) continue;
    if (!Array.isArray(resp)) {
      // single response (some servers downgrade) — treat as error
      for (const a of slice) out.set(a, false);
      continue;
    }
    for (const item of resp) {
      const localIdx = item.id - i;
      const addr = slice[localIdx];
      if (!addr) continue;
      const code = item && item.result;
      const verified =
        typeof code === 'string' && code !== '0x' && code !== '0x0' && code !== null;
      out.set(addr, !!verified);
    }
  }
  return out;
}

// ---------- Concurrency helper ----------

async function runInBatches(items, size, worker) {
  const results = new Array(items.length);
  for (let i = 0; i < items.length; i += size) {
    const slice = items.slice(i, i + size);
    const settled = await Promise.all(
      slice.map((item, j) =>
        worker(item, i + j).catch((err) => ({
          __error: err.message || String(err),
          item,
        }))
      )
    );
    for (let j = 0; j < settled.length; j++) {
      results[i + j] = settled[j];
    }
  }
  return results;
}

// ---------- Main ----------

async function main() {
  const csvText = fs.readFileSync(CSV_PATH, 'utf8');
  const dapps = parseCsv(csvText);
  console.log(`Loaded ${dapps.length} dApps from CSV`);

  // 1) Scrape all dApps in batches of DAPP_CONCURRENCY
  let completed = 0;
  const results = await runInBatches(dapps, DAPP_CONCURRENCY, async (dapp) => {
    const r = await scrapeDapp(dapp);
    completed++;
    const tag = r.name || r.url;
    if (r.scrapeError) {
      console.log(
        `[${completed}/${dapps.length}] ${tag}: ERROR ${r.scrapeError}`
      );
    } else {
      console.log(
        `[${completed}/${dapps.length}] ${tag}: ${r.candidatesFound} candidates`
      );
    }
    return r;
  });

  // 2) Build global unique candidate set
  const allCandidates = new Set();
  for (const r of results) {
    if (r && r._candidates) {
      for (const a of r._candidates) allCandidates.add(a);
    }
  }
  const candidateList = Array.from(allCandidates);
  console.log(
    `\nGlobal unique candidates to validate: ${candidateList.length}`
  );

  // 3) Batched eth_getCode
  const verifiedMap = await batchEthGetCode(candidateList);
  const verifiedCount = Array.from(verifiedMap.values()).filter(Boolean).length;
  console.log(`Verified contracts on Ritual: ${verifiedCount}\n`);

  // 4) Populate per-dApp contracts and finalize
  const final = results.map((r) => {
    const contracts = [];
    if (r._candidates) {
      for (const addr of r._candidates) {
        if (verifiedMap.get(addr)) {
          contracts.push({ address: addr, verified: true });
        }
      }
      // stable sort by address for deterministic output
      contracts.sort((a, b) => a.address.localeCompare(b.address));
    }
    const { _candidates, ...rest } = r;
    return { ...rest, contracts };
  });

  // 5) Write output
  fs.mkdirSync(path.dirname(OUT_PATH), { recursive: true });
  fs.writeFileSync(OUT_PATH, JSON.stringify(final, null, 2));
  console.log(`Wrote ${OUT_PATH}`);

  // 6) Summary + completion log per dApp (with verified count)
  console.log('\n--- Per-dApp verified counts ---');
  for (let i = 0; i < final.length; i++) {
    const f = final[i];
    console.log(
      `[${i + 1}/${final.length}] ${f.name || f.url}: ${f.candidatesFound} candidates, ${f.contracts.length} verified contracts`
    );
  }

  const failed = final.filter((f) => f.scrapeError);
  const succeeded = final.filter((f) => !f.scrapeError);

  const globalVerified = new Set();
  for (const f of final) {
    for (const c of f.contracts) globalVerified.add(c.address);
  }

  const topByVerified = [...final]
    .sort((a, b) => b.contracts.length - a.contracts.length)
    .slice(0, 10);

  console.log('\n=== SUMMARY ===');
  console.log(`Total dApps: ${final.length}`);
  console.log(`Succeeded:   ${succeeded.length}`);
  console.log(`Failed:      ${failed.length}`);
  console.log(`Unique verified contracts: ${globalVerified.size}`);
  console.log('\nTop 10 dApps by verified contract count:');
  for (const t of topByVerified) {
    console.log(`  ${t.contracts.length.toString().padStart(3)}  ${t.name || t.url}`);
  }

  if (failed.length) {
    console.log('\nFailures:');
    for (const f of failed) {
      console.log(`  - ${f.name || f.url}: ${f.scrapeError}`);
    }
  }
}

main().catch((err) => {
  console.error('FATAL:', err);
  process.exit(1);
});
