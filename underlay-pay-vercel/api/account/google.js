import { cors } from "../../lib/license.mjs";
import { cleanEmail, googleAccount } from "../../lib/account.mjs";

async function emailFromGoogleToken(token) {
  const access = String(token || "").trim();
  if (access.length < 20 || access.length > 4096) return "";
  const res = await fetch("https://www.googleapis.com/oauth2/v3/userinfo", {
    headers: { Authorization: `Bearer ${access}` },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data.email_verified === false) return "";
  return cleanEmail(data.email);
}

export default async function handler(req, res) {
  cors(res);
  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "POST") return res.status(405).json({ ok: false });
  const email = await emailFromGoogleToken(req.body?.token);
  if (!email) return res.status(401).json({ ok: false, error: "google" });
  const row = await googleAccount(email);
  if (row.error === "noconfig") return res.status(503).json({ ok: false, error: "noconfig" });
  if (row.error === "password") return res.status(409).json({ ok: false, error: "password" });
  if (row.error) return res.status(502).json({ ok: false, error: "stripe", detail: row.detail || "" });
  return res.status(200).json(row);
}
