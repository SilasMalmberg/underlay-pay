const NOTIFY = process.env.NOTIFY_EMAIL || "info@underlay-app.online";

export function mailReady() {
  return !!process.env.RESEND_API_KEY;
}

export async function sendMail({ to, subject, html }) {
  const key = process.env.RESEND_API_KEY || "";
  if (!key) return { ok: false, error: "nomail" };
  const from = process.env.MAIL_FROM || "UNDERLAY <info@underlay-app.online>";
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ from, to: Array.isArray(to) ? to : [to], subject, html }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) return { ok: false, error: "nomail", detail: data.message || data.error || "" };
  return { ok: true };
}

export function notifySignup(email, how) {
  const when = new Date().toISOString();
  return sendMail({
    to: NOTIFY,
    subject: "New UNDERLAY account",
    html: `<p>A new account was created.</p><p><b>${email}</b><br/>${how || "password"}<br/>${when}</p>`,
  }).catch(() => ({ ok: false }));
}
