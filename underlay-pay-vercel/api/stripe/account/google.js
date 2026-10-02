import { cors } from "../../lib/license.mjs";
import { cleanEmail, googleAccount } from "../../lib/account.mjs";

export default async function handler(req, res) {
  cors(res);
  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "POST") return res.status(405).json({ ok: false });
  const email = cleanEmail(req.body?.email);
  if (!email) return res.status(400).json({ ok: false, error: "email" });
  const row = await googleAccount(email);
  if (row.error === "noconfig") return res.status(503).json({ ok: false, error: "noconfig" });
  if (row.error === "password") return res.status(409).json({ ok: false, error: "password" });
  if (row.error) return res.status(502).json({ ok: false, error: "stripe" });
  return res.status(200).json(row);
}
