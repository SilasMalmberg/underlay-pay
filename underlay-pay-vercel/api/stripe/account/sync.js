import { cors } from "../../lib/license.mjs";
import { syncAccount } from "../../lib/account.mjs";

export default async function handler(req, res) {
  cors(res);
  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "POST") return res.status(405).json({ ok: false });
  const token = String(req.body?.token || "");
  const platforms = Object.prototype.hasOwnProperty.call(req.body || {}, "platforms") ? req.body.platforms : null;
  const row = await syncAccount(token, platforms);
  if (row.error === "noconfig") return res.status(503).json({ ok: false, error: "noconfig" });
  if (row.error === "auth" || row.error === "missing") return res.status(401).json({ ok: false, error: "auth" });
  if (row.error) return res.status(502).json({ ok: false, error: "stripe" });
  return res.status(200).json(row);
}
