import { createHmac } from "node:crypto";

const PLANS = ["underlay", "pro", "max", "play"];

export function stripeKey() {
  return process.env.STRIPE_SECRET_KEY || "";
}

function secret() {
  return process.env.LICENSE_SECRET || process.env.STRIPE_SECRET_KEY || "";
}

export function parsePlan(value) {
  const p = String(value || "").toLowerCase();
  return PLANS.includes(p) ? p : null;
}

export function planFromAmount(cents) {
  const n = Number(cents) || 0;
  if (n >= 1800) return "max";
  if (n >= 950) return "pro";
  if (n >= 750) return "play";
  if (n > 0) return "underlay";
  return null;
}

export function signLicense(plan, sid) {
  const key = secret();
  if (!key) throw new Error("no-secret");
  const payload = { plan, sid, exp: Date.now() + 1000 * 60 * 60 * 24 };
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const sig = createHmac("sha256", key).update(body).digest("base64url");
  return `${body}.${sig}`;
}

export function readLicense(token) {
  const key = secret();
  if (!key || !token || !token.includes(".")) return null;
  const [body, sig] = token.split(".");
  const expect = createHmac("sha256", key).update(body).digest("base64url");
  if (expect.length !== sig.length) return null;
  let n = 0;
  for (let i = 0; i < expect.length; i++) n |= expect.charCodeAt(i) ^ sig.charCodeAt(i);
  if (n !== 0) return null;
  try {
    const data = JSON.parse(Buffer.from(body, "base64url").toString("utf8"));
    const plan = parsePlan(data.plan);
    if (!plan || !data.sid || Number(data.exp) < Date.now()) return null;
    return { plan, sid: String(data.sid) };
  } catch {
    return null;
  }
}

export async function fetchCheckoutSession(id) {
  const key = stripeKey();
  if (!key) return null;
  const res = await fetch(
    `https://api.stripe.com/v1/checkout/sessions/${encodeURIComponent(id)}?expand[]=line_items`,
    { headers: { Authorization: `Bearer ${key}` } },
  );
  if (!res.ok) return null;
  return res.json();
}

export function sessionPaid(s) {
  if (!s) return false;
  return (
    s.payment_status === "paid" ||
    s.payment_status === "no_payment_required" ||
    s.status === "complete"
  );
}

export function planFromSession(s) {
  const items = s && s.line_items && s.line_items.data;
  if (Array.isArray(items)) {
    for (const item of items) {
      const unit = item && item.price && item.price.unit_amount;
      const plan = planFromAmount(unit);
      if (plan) return plan;
    }
  }
  return planFromAmount(Number(s && s.amount_total) || 0);
}

export function cors(res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
}
