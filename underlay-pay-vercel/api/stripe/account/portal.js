import { cors } from "../../lib/license.mjs";
import { cleanEmail, openPortal, readAccount } from "../../lib/account.mjs";

export default async function handler(req, res) {
  cors(res);
  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "POST") return res.status(405).json({ ok: false });
  let email = cleanEmail(req.body && req.body.email);
  if (!email && req.body && req.body.token) {
    const row = readAccount(req.body.token);
    email = row && row.email;
  }
  const out = await openPortal(email);
  if (!out.ok) {
    const status = out.error === "missing" ? 404 : 503;
    return res.status(status).json({ ok: false, error: out.error || "stripe" });
  }
  return res.status(200).json(out);
}
