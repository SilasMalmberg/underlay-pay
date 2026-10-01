import { createHmac, timingSafeEqual } from "node:crypto";
import { refreshCustomerById } from "../../lib/account.mjs";

export const config = { api: { bodyParser: false } };

function rawBody(req) {
  return new Promise((resolve, reject) => {
    if (typeof req.body === "string") return resolve(req.body);
    if (Buffer.isBuffer(req.body)) return resolve(req.body.toString("utf8"));
    const chunks = [];
    req.on("data", (c) => chunks.push(Buffer.isBuffer(c) ? c : Buffer.from(c)));
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

function signed(raw, header, secret) {
  let stamp = "";
  const sigs = [];
  String(header || "")
    .split(",")
    .forEach((part) => {
      const i = part.indexOf("=");
      if (i < 0) return;
      const key = part.slice(0, i);
      const val = part.slice(i + 1);
      if (key === "t") stamp = val;
      if (key === "v1" && val) sigs.push(val);
    });
  const ts = Number(stamp);
  if (!stamp || !sigs.length || !Number.isFinite(ts)) return false;
  if (Math.abs(Date.now() / 1000 - ts) > 300) return false;
  const expect = createHmac("sha256", secret).update(`${stamp}.${raw}`).digest("hex");
  return sigs.some((sig) => {
    if (sig.length !== expect.length) return false;
    try {
      return timingSafeEqual(Buffer.from(sig), Buffer.from(expect));
    } catch {
      return false;
    }
  });
}

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ ok: false });
  const secret = process.env.STRIPE_WEBHOOK_SECRET || "";
  if (!secret) return res.status(503).json({ ok: false, error: "noconfig" });
  const raw = await rawBody(req);
  if (!signed(raw, req.headers["stripe-signature"], secret)) return res.status(400).json({ ok: false });
  let event;
  try {
    event = JSON.parse(raw);
  } catch {
    return res.status(400).json({ ok: false });
  }
  const type = String(event.type || "");
  if (!type.startsWith("customer.subscription.")) return res.status(200).json({ ok: true });
  const customer = event.data && event.data.object && event.data.object.customer;
  if (!customer) return res.status(200).json({ ok: true });
  await refreshCustomerById(customer);
  return res.status(200).json({ ok: true });
}
