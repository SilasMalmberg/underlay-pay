import { cors } from "../../lib/license.mjs";
import { cleanEmail, signupAccount } from "../../lib/account.mjs";

export default async function handler(req, res) {
  cors(res);
  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "POST") return res.status(405).json({ ok: false });
  const email = cleanEmail(req.body?.email);
  const password = String(req.body?.password || "");
  if (!email) return res.status(400).json({ ok: false, error: "email" });
  const row = await signupAccount(email, password);
  if (row.error === "noconfig") return res.status(503).json({ ok: false, error: "noconfig" });
  if (row.error === "exists") return res.status(409).json({ ok: false, error: "exists" });
  if (row.error === "pass") return res.status(400).json({ ok: false, error: "pass" });
  if (row.error) return res.status(502).json({ ok: false, error: "stripe" });
  return res.status(200).json(row);
}
