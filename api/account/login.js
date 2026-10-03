import { cors } from "../../lib/license.mjs";
import { cleanEmail, loginAccount } from "../../lib/account.mjs";

export default async function handler(req, res) {
  cors(res);
  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "POST") return res.status(405).json({ ok: false });
  const email = cleanEmail(req.body?.email);
  const password = String(req.body?.password || "");
  if (!email) return res.status(400).json({ ok: false, error: "email" });
  const row = await loginAccount(email, password);
  if (row.error === "noconfig") return res.status(503).json({ ok: false, error: "noconfig" });
  if (row.error === "missing") return res.status(404).json({ ok: false, error: "missing" });
  if (row.error) return res.status(401).json({ ok: false, error: "pass" });
  return res.status(200).json(row);
}
