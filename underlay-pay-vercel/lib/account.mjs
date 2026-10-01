import { createHmac, timingSafeEqual } from "node:crypto";
import { parsePlan, planFromAmount, stripeKey } from "./license.mjs";

const PLATS = ["chatgpt", "claude", "gemini", "grok", "perplexity", "deepseek", "meta"];

function secret() {
  return process.env.LICENSE_SECRET || process.env.STRIPE_SECRET_KEY || "underlay-account";
}

function authHeader() {
  return { Authorization: `Bearer ${stripeKey()}` };
}

async function stripeGet(path) {
  const res = await fetch(`https://api.stripe.com/v1${path}`, { headers: authHeader() });
  const data = await res.json().catch(() => ({}));
  return { ok: res.ok, data };
}

async function stripeForm(path, params) {
  const res = await fetch(`https://api.stripe.com/v1${path}`, {
    method: "POST",
    headers: { ...authHeader(), "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(params),
  });
  const data = await res.json().catch(() => ({}));
  return { ok: res.ok, data };
}

export function cleanEmail(value) {
  const email = String(value || "").trim().toLowerCase();
  if (!email.includes("@") || email.length > 180) return "";
  return email;
}

export function passwordHash(email, password) {
  return createHmac("sha256", secret()).update(`${email}\n${password}`).digest("hex");
}

export function passwordOk(email, password, hash) {
  const next = passwordHash(email, password);
  if (!hash || next.length !== String(hash).length) return false;
  try {
    return timingSafeEqual(Buffer.from(next), Buffer.from(String(hash)));
  } catch {
    return false;
  }
}

export function signAccount(email) {
  const payload = { kind: "acct", email, exp: Date.now() + 1000 * 60 * 60 * 24 * 30 };
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const sig = createHmac("sha256", secret()).update(body).digest("base64url");
  return `${body}.${sig}`;
}

export function readAccount(token) {
  if (!token || !String(token).includes(".")) return null;
  const [body, sig] = String(token).split(".");
  const expect = createHmac("sha256", secret()).update(body).digest("base64url");
  if (expect.length !== sig.length) return null;
  let n = 0;
  for (let i = 0; i < expect.length; i++) n |= expect.charCodeAt(i) ^ sig.charCodeAt(i);
  if (n !== 0) return null;
  try {
    const data = JSON.parse(Buffer.from(body, "base64url").toString("utf8"));
    if (data.kind !== "acct" || !data.email || Number(data.exp) < Date.now()) return null;
    return { email: cleanEmail(data.email) };
  } catch {
    return null;
  }
}

export function cleanPlatforms(list) {
  const raw = Array.isArray(list) ? list : String(list || "").split(",");
  const out = [];
  raw.forEach((id) => {
    const v = String(id || "").trim().toLowerCase();
    if (PLATS.includes(v) && !out.includes(v)) out.push(v);
  });
  return out;
}

function profileOf(customer) {
  const meta = (customer && customer.metadata) || {};
  const plan = parsePlan(meta.plan) || "preview";
  let platforms = cleanPlatforms(meta.platforms);
  if (plan === "max") platforms = PLATS.slice();
  return {
    email: cleanEmail(customer.email),
    plan,
    paid: meta.paid === "1" && plan !== "preview",
    platforms,
    auth: meta.auth === "google" ? "google" : "password",
  };
}

const LIVE = new Set(["active", "trialing", "past_due"]);
const RANK = { underlay: 1, play: 2, pro: 3, max: 4 };

export async function refreshCustomerAccess(customer) {
  if (!customer || !customer.id || !stripeKey()) return customer;
  const listed = await stripeGet(
    `/subscriptions?customer=${encodeURIComponent(customer.id)}&status=all&limit=100`,
  );
  if (!listed.ok || !listed.data || !Array.isArray(listed.data.data)) return customer;
  const subs = listed.data.data;
  if (!subs.length) return customer;
  const meta = customer.metadata || {};
  let best = null;
  for (const sub of subs) {
    if (!LIVE.has(sub.status)) continue;
    const item = sub.items && sub.items.data && sub.items.data[0];
    const plan = planFromAmount(item && item.price && item.price.unit_amount);
    if (!plan) continue;
    if (!best || RANK[plan] > RANK[best]) best = plan;
  }
  if (best) {
    if (meta.paid === "1" && meta.plan === best) return customer;
    const made = await writeCustomer(customer.id, {
      "metadata[paid]": "1",
      "metadata[plan]": best,
      "metadata[platforms]": best === "max" ? PLATS.join(",") : meta.platforms || "",
    });
    return made.ok && made.data ? made.data : customer;
  }
  if (meta.paid !== "1") return customer;
  const made = await writeCustomer(customer.id, {
    "metadata[paid]": "0",
    "metadata[plan]": "preview",
  });
  return made.ok && made.data ? made.data : customer;
}

export async function refreshCustomerById(id) {
  const clean = String(id || "");
  if (!clean.startsWith("cus_")) return { error: "missing" };
  const found = await stripeGet(`/customers/${encodeURIComponent(clean)}`);
  if (!found.ok || !found.data || !found.data.id) return { error: "stripe" };
  const next = await refreshCustomerAccess(found.data);
  return publicProfile(next);
}
export async function findCustomer(email) {
  const q = `email:"${email.replace(/"/g, "")}"`;
  const found = await stripeGet(`/customers/search?query=${encodeURIComponent(q)}&limit=1`);
  if (!found.ok) return { error: "stripe" };
  const row = found.data && found.data.data && found.data.data[0];
  return { customer: row || null };
}

async function writeCustomer(id, params) {
  const path = id ? `/customers/${id}` : "/customers";
  return stripeForm(path, params);
}

export async function signupAccount(email, password) {
  if (!stripeKey()) return { error: "noconfig" };
  if (!password || String(password).length < 4) return { error: "pass" };
  const found = await findCustomer(email);
  if (found.error) return found;
  const hash = passwordHash(email, password);
  const base = {
    "metadata[pw]": hash,
    "metadata[auth]": "password",
    "metadata[plan]": "preview",
    "metadata[paid]": "0",
    "metadata[platforms]": "",
  };
  if (!found.customer) {
    const made = await writeCustomer("", { email, ...base });
    if (!made.ok) return { error: "stripe" };
    return publicProfile(made.data);
  }
  const meta = found.customer.metadata || {};
  if (meta.pw) return { error: "exists" };
  const made = await writeCustomer(found.customer.id, {
    "metadata[pw]": hash,
    "metadata[auth]": "password",
    "metadata[plan]": meta.plan || "preview",
    "metadata[paid]": meta.paid || "0",
    "metadata[platforms]": meta.platforms || "",
  });
  if (!made.ok) return { error: "stripe" };
  return publicProfile(made.data);
}

export async function loginAccount(email, password) {
  if (!stripeKey()) return { error: "noconfig" };
  const found = await findCustomer(email);
  if (found.error) return found;
  if (!found.customer || !(found.customer.metadata || {}).pw) return { error: "missing" };
  if (!passwordOk(email, password, found.customer.metadata.pw)) return { error: "pass" };
  const fresh = await refreshCustomerAccess(found.customer);
  return publicProfile(fresh);
}

export async function googleAccount(email) {
  if (!stripeKey()) return { error: "noconfig" };
  const found = await findCustomer(email);
  if (found.error) return found;
  if (!found.customer) {
    const made = await writeCustomer("", {
      email,
      "metadata[auth]": "google",
      "metadata[plan]": "preview",
      "metadata[paid]": "0",
      "metadata[platforms]": "",
    });
    if (!made.ok) return { error: "stripe" };
    return publicProfile(made.data);
  }
  if ((found.customer.metadata || {}).pw) return { error: "password" };
  const fresh = await refreshCustomerAccess(found.customer);
  return publicProfile(fresh);
}

export function publicProfile(customer) {
  const row = profileOf(customer);
  return { ok: true, token: signAccount(row.email), id: String(customer.id || ""), ...row };
}

export async function syncAccount(token, platforms) {
  if (!stripeKey()) return { error: "noconfig" };
  const row = readAccount(token);
  if (!row || !row.email) return { error: "auth" };
  const found = await findCustomer(row.email);
  if (found.error) return found;
  if (!found.customer) return { error: "missing" };
  const fresh = await refreshCustomerAccess(found.customer);
  if (platforms == null) return publicProfile(fresh);
  const list = cleanPlatforms(platforms);
  const plan = parsePlan((fresh.metadata || {}).plan);
  if ((fresh.metadata || {}).paid !== "1") return publicProfile(fresh);
  const saved = plan === "max" ? PLATS.slice() : list;
  const made = await writeCustomer(found.customer.id, { "metadata[platforms]": saved.join(",") });
  if (!made.ok) return { error: "stripe" };
  return publicProfile(made.data);
}

export async function openPortal(email) {
  if (!stripeKey()) return { error: "noconfig" };
  const clean = cleanEmail(email);
  if (!clean) return { error: "missing" };
  const found = await findCustomer(clean);
  if (found.error) return found;
  if (!found.customer) return { error: "missing" };
  const made = await stripeForm("/billing_portal/sessions", {
    customer: found.customer.id,
    return_url: "https://underlay-pay-info.vercel.app/thanks",
  });
  if (!made.ok || !made.data || !made.data.url) return { error: "stripe" };
  return { ok: true, url: made.data.url };
}

export async function savePaidPlan(email, plan) {
  const clean = cleanEmail(email);
  const next = parsePlan(plan);
  if (!clean || !next || !stripeKey()) return { error: "skip" };
  const found = await findCustomer(clean);
  if (found.error || !found.customer) {
    const made = await writeCustomer("", {
      email: clean,
      "metadata[auth]": "password",
      "metadata[plan]": next,
      "metadata[paid]": "1",
      "metadata[platforms]": next === "max" ? PLATS.join(",") : "",
    });
    return made.ok ? publicProfile(await refreshCustomerAccess(made.data)) : { error: "stripe" };
  }
  const meta = found.customer.metadata || {};
  const made = await writeCustomer(found.customer.id, {
    "metadata[plan]": next,
    "metadata[paid]": "1",
    "metadata[platforms]": next === "max" ? PLATS.join(",") : meta.platforms || "",
  });
  return made.ok ? publicProfile(await refreshCustomerAccess(made.data)) : { error: "stripe" };
}
