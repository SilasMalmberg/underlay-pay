import { stripeKey } from "../../lib/license.mjs";
import { cleanEmail, savePaidPlan } from "../../lib/account.mjs";

const CODES = {
  "UL-START": { plan: "underlay", max: 5 },
  "UL-PRO": { plan: "pro", max: 5 },
  "UL-MAX": { plan: "max", max: 5 },
};
const LEDGER = "ledger@underlay.invalid";

function cors(res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
}

async function stripeGet(path) {
  const res = await fetch(`https://api.stripe.com/v1${path}`, {
    headers: { Authorization: `Bearer ${stripeKey()}` },
  });
  return res.json().catch(() => ({}));
}

async function stripeForm(path, params) {
  const res = await fetch(`https://api.stripe.com/v1${path}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${stripeKey()}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams(params),
  });
  return res.json().catch(() => ({}));
}

async function ledger() {
  const found = await stripeGet(`/customers?email=${encodeURIComponent(LEDGER)}&limit=1`);
  const hit = found && found.data && found.data[0];
  if (hit && hit.id) return hit;
  return stripeForm("/customers", { email: LEDGER, name: "Underlay promo ledger" });
}

async function grant(email, plan, code) {
  const profile = await savePaidPlan(email, plan, code);
  if (!profile || !profile.ok || !profile.paid) return null;
  return profile;
}

export default async function handler(req, res) {
  cors(res);
  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "POST") return res.status(405).json({ ok: false, error: "bad" });
  if (!stripeKey()) return res.status(503).json({ ok: false, error: "net" });
  const code = String(req.body?.code || "").trim().toUpperCase();
  const email = cleanEmail(req.body?.email);
  const row = CODES[code];
  if (!row) return res.status(404).json({ ok: false, error: "bad" });
  if (!email) return res.status(401).json({ ok: false, error: "login" });
  const book = await ledger();
  if (!book || !book.id) return res.status(503).json({ ok: false, error: "net" });
  const meta = Object.assign({}, book.metadata || {});
  const who = String(meta[code + "_who"] || "")
    .split(",")
    .map((x) => x.trim())
    .filter(Boolean);
  if (who.includes(email)) {
    const profile = await grant(email, row.plan, code);
    if (!profile) return res.status(503).json({ ok: false, error: "net" });
    return res.status(200).json({ ...profile, left: Math.max(0, row.max - who.length) });
  }
  if (who.length >= row.max) return res.status(409).json({ ok: false, error: "gone" });
  const profile = await grant(email, row.plan, code);
  if (!profile) return res.status(503).json({ ok: false, error: "net" });
  who.push(email);
  const saved = await stripeForm(`/customers/${book.id}`, {
    [`metadata[${code}_who]`]: who.join(","),
    [`metadata[${code}]`]: String(who.length),
  });
  if (!saved || !saved.id) return res.status(503).json({ ok: false, error: "net" });
  return res.status(200).json({ ...profile, left: Math.max(0, row.max - who.length) });
}