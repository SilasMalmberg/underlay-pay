import { cors } from "../../lib/license.mjs";
import { resetPassword } from "../../lib/account.mjs";

export default async function handler(req, res) {
  cors(res);
  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "POST") return res.status(405).json({ ok: false });
  const row = await resetPassword(req.body?.token, req.body?.password);
  if (row.error === "noconfig") return res.status(503).json({ ok: false, error: "noconfig" });
  if (row.error === "pass") return res.status(400).json({ ok: false, error: "pass" });
  if (row.error === "token") return res.status(400).json({ ok: false, error: "token" });
  if (row.error) return res.status(502).json({ ok: false, error: "stripe" });
  return res.status(200).json({ ok: true });
}
