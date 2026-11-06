#!/usr/bin/env node
/** Validates JSON data integrity across config, catalog, and outcomes. */
import { readFileSync } from "fs";
import path from "path";
import { fileURLToPath } from "url";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

function load(rel) {
  return JSON.parse(readFileSync(path.join(root, rel), "utf8"));
}

const errors = [];
const config = load("config/app.json");
const { families } = load("catalog/families.json");
const { links } = load("catalog/links.json");
const { solutions } = load("catalog/solutions.json");
const { oems } = load("catalog/oems.json");
const { products } = load("catalog/products.json");
const { oemProducts } = load("catalog/oem-products.json");
const { outcomes } = load("outcomes/outcomes.json");

const pillarIds = new Set(config.pillars.map((p) => p.id));
const categories = new Set(config.categories);
const familyIds = new Set(families.map((f) => f.id));
const solutionIds = new Set(solutions.map((s) => s.id));
const oemIds = new Set((oems || []).map((o) => o.id));
const productIds = new Set((products || []).map((p) => p.id));
const httpsOk = (url) => /^https:\/\//.test(url);
const publicHostOk = (url) =>
  /^https:\/\/(international\.bt\.com|www\.cisco\.com|www\.webex\.com|bnarcum\.github\.io)\//.test(url);

for (const port of config.portfolios || []) {
  if (!port.id || !port.name) errors.push(`portfolio missing id/name: ${JSON.stringify(port)}`);
  for (const fid of port.families || []) {
    if (!familyIds.has(fid)) errors.push(`portfolio ${port.id}: unknown family "${fid}"`);
  }
}
const covered = new Set((config.portfolios || []).flatMap((p) => p.families || []));
for (const f of families) {
  if (config.portfolios?.length && !covered.has(f.id)) errors.push(`family ${f.id}: not listed in a portfolio`);
}

if (!config.pillars.length) errors.push("config: no pillars defined");
if (!config.categories.length) errors.push("config: no categories defined");

for (const f of families) {
  if (!f.id || !f.name) errors.push(`family missing id/name: ${JSON.stringify(f)}`);
  if (!pillarIds.has(f.pillar)) errors.push(`family ${f.id}: unknown pillar "${f.pillar}"`);
  if (!categories.has(f.category)) errors.push(`family ${f.id}: unknown category "${f.category}"`);
  const next = f.seller?.next;
  if (next?.url && !httpsOk(next.url)) errors.push(`family ${f.id}: next.url must be https`);
  if (next?.url && !publicHostOk(next.url)) errors.push(`family ${f.id}: next.url host is not an allowed public source`);
}

for (const l of links) {
  if (!l.source || !l.target) errors.push(`link missing source/target: ${JSON.stringify(l)}`);
  if (!familyIds.has(l.source)) errors.push(`link: unknown source "${l.source}"`);
  if (!familyIds.has(l.target)) errors.push(`link: unknown target "${l.target}"`);
}

for (const s of solutions) {
  if (!s.id || !s.name) errors.push(`solution missing id/name: ${JSON.stringify(s)}`);
  if (!pillarIds.has(s.pillar)) errors.push(`solution ${s.id}: unknown pillar "${s.pillar}"`);
  if (!categories.has(s.category)) errors.push(`solution ${s.id}: unknown category "${s.category}"`);
  if (s.url && !httpsOk(s.url)) errors.push(`solution ${s.id}: url must be https`);
  if (s.url && !publicHostOk(s.url)) errors.push(`solution ${s.id}: url host is not an allowed public source`);
  for (const fid of s.families || []) {
    if (!familyIds.has(fid)) errors.push(`solution ${s.id}: unknown family "${fid}"`);
  }
}

for (const o of oems || []) {
  const groupIds = new Set((o.portfolio || []).map((g) => g.id));
  for (const p of products || []) {
    if (p.oem !== o.id) continue;
    if (!p.group) errors.push(`product ${p.id}: missing group for oem ${o.id}`);
    else if (groupIds.size && !groupIds.has(p.group)) errors.push(`product ${p.id}: unknown group "${p.group}"`);
  }
}

for (const p of products || []) {
  if (!p.id || !p.name) errors.push(`product missing id/name: ${JSON.stringify(p)}`);
  if (!oemIds.has(p.oem)) errors.push(`product ${p.id}: unknown oem "${p.oem}"`);
  if (p.url && !httpsOk(p.url)) errors.push(`product ${p.id}: url must be https`);
  if (p.url && !publicHostOk(p.url)) errors.push(`product ${p.id}: url host is not an allowed public source`);
  if (!(p.families || []).length) errors.push(`product ${p.id}: no families`);
  for (const fid of p.families || []) {
    if (!familyIds.has(fid)) errors.push(`product ${p.id}: unknown family "${fid}"`);
  }
  for (const sid of p.offerings || []) {
    if (!solutionIds.has(sid)) errors.push(`product ${p.id}: unknown offering "${sid}"`);
  }
}

for (const p of oemProducts || []) {
  if (!p.id || !p.name) errors.push(`oemProduct missing id/name: ${JSON.stringify(p)}`);
  if (!oemIds.has(p.oem)) errors.push(`oemProduct ${p.id}: unknown oem "${p.oem}"`);
  if (!productIds.has(p.family)) errors.push(`oemProduct ${p.id}: unknown product family "${p.family}"`);
  if (p.url && !httpsOk(p.url)) errors.push(`oemProduct ${p.id}: url must be https`);
  if (p.successor && !oemProducts.some((x) => x.id === p.successor)) {
    errors.push(`oemProduct ${p.id}: unknown successor "${p.successor}"`);
  }
}

for (const o of outcomes) {
  if (!o.id || !o.outcome) errors.push(`outcome missing id/outcome: ${JSON.stringify(o)}`);
  if (!pillarIds.has(o.pillar)) errors.push(`outcome ${o.id}: unknown pillar "${o.pillar}"`);
  for (const sid of o.solutions || []) {
    if (!solutionIds.has(sid)) errors.push(`outcome ${o.id}: unknown solution "${sid}"`);
  }
  for (const fid of o.families || []) {
    if (!familyIds.has(fid)) errors.push(`outcome ${o.id}: unknown family "${fid}"`);
  }
}

const banned = /wwwin-github\.cisco\.com/;
function scan(obj, loc) {
  if (typeof obj === "string") {
    if (banned.test(obj)) errors.push(`${loc}: contains an internal Cisco hostname`);
    return;
  }
  if (Array.isArray(obj)) {
    obj.forEach((v, i) => scan(v, `${loc}[${i}]`));
    return;
  }
  if (obj && typeof obj === "object") {
    for (const [k, v] of Object.entries(obj)) scan(v, `${loc}.${k}`);
  }
}
scan(config, "config");
scan(families, "families");
scan(solutions, "solutions");
scan(outcomes, "outcomes");
scan(products, "products");

if (errors.length) {
  console.error("FAIL test-data");
  errors.forEach((e) => console.error("  -", e));
  process.exit(1);
}

console.log(
  `OK test-data (${families.length} families, ${links.length} links, ${solutions.length} solutions, ` +
    `${outcomes.length} outcomes, ${products.length} cisco families, ${oemProducts.length} sku rows)`
);
