import { Resend } from "resend";

const apiKey = process.env.RESEND_API_KEY;
const fromAddress = process.env.EMAIL_FROM ?? "Kaart <onboarding@resend.dev>";

const resend = apiKey ? new Resend(apiKey) : null;

/** Best-effort transactional email. If RESEND_API_KEY isn't configured (e.g. local dev
 * without it set up yet), this logs instead of throwing — auth flows that trigger an
 * email (password reset) should never hard-fail just because mail isn't wired up. */
export async function sendEmail({
  to,
  subject,
  html,
}: {
  to: string;
  subject: string;
  html: string;
}) {
  if (!resend) {
    console.warn(`[email] RESEND_API_KEY ontbreekt — e-mail naar ${to} ("${subject}") niet verzonden.`);
    return;
  }

  const { error } = await resend.emails.send({ from: fromAddress, to, subject, html });
  if (error) {
    console.error(`[email] Verzenden naar ${to} mislukt:`, error);
  }
}
