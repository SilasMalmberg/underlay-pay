import {
  cors,
  fetchCheckoutSession,
  planFromSession,
  sessionPaid,
  signLicense,
  stripeKey,
} from "../../lib/license.mjs";
import { cleanEmail, savePaidPlan } from "../../lib/account.mjs";

export default async function handler(req, res) {
  cors(res);
  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "POST") return res.status(405).json({ ok: false });
  const sessionId = String(req.body?.session_id || "").trim();
  if (!sessionId.startsWith("cs_")) return res.status(400).json({ ok: false, error: "bad" });
  if (!stripeKey()) return res.status(503).json({ ok: false, error: "noconfig" });
  const session = await fetchCheckoutSession(sessionId);
  if (!sessionPaid(session)) return res.status(402).json({ ok: false, error: "unpaid" });
  try {
    const rawRef = String(session.client_reference_id || "");
    const marked = rawRef.match(/^(?:underlay|pro|max|play):(.*)$/);
    const email = cleanEmail(
      (session.customer_details && session.customer_details.email) ||
        session.customer_email ||
        (marked ? marked[1] : rawRef)
    );
    const plan = planFromSession(session);
    if (!plan) return res.status(402).json({ ok: false, error: "unpaid" });
    if (email) await savePaidPlan(email, plan);
    const token = signLicense(plan, session.id || sessionId);
    return res.status(200).json({ ok: true, plan, token, email });
  } catch {
    return res.status(503).json({ ok: false, error: "noconfig" });
  }
}
