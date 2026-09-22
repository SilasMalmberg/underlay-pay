import { cors, readLicense } from "../../lib/license.mjs";

export default async function handler(req, res) {
  cors(res);
  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "POST") return res.status(405).json({ ok: false });
  const token = String(req.body?.token || "").trim();
  const row = readLicense(token);
  if (!row) return res.status(401).json({ ok: false, error: "bad" });
  return res.status(200).json({ ok: true, plan: row.plan });
}
