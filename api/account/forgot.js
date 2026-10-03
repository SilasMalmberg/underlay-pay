import { cors } from "../../lib/license.mjs";
import { cleanEmail, requestReset } from "../../lib/account.mjs";

function originOf(req) {
  const host = req.headers["x-forwarded-host"] || req.headers.host || "underlay-pay-info.vercel.app";
  const proto = req.headers["x-forwarded-proto"] || "https";
  return `${proto}://${host}`;
}

export default async function handler(req, res) {
  cors(res);
  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "POST") return res.status(405).json({ ok: false });
  const email = cleanEmail(req.body?.email);
  if (!email) return res.status(400).json({ ok: false, error: "email" });
  const row = await requestReset(email, originOf(req));
  if (row.error === "noconfig") return res.status(503).json({ ok: false, error: "noconfig" });
  if (row.error === "nomail") return res.status(503).json({ ok: false, error: "nomail" });
  if (row.error) return res.status(502).json({ ok: false, error: "stripe" });
  return res.status(200).json({ ok: true });
}
