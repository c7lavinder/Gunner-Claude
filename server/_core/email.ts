import { Resend } from "resend";
import { ENV } from "./env";

let resendClient: Resend | null = null;

function getClient(): Resend {
  if (!resendClient) {
    if (!ENV.resendApiKey) throw new Error("Resend API key not configured");
    resendClient = new Resend(ENV.resendApiKey);
  }
  return resendClient;
}

export async function sendEmail(params: {
  to: string | string[];
  subject: string;
  html: string;
  from?: string;
}): Promise<{ id: string }> {
  const resend = getClient();
  const { data, error } = await resend.emails.send({
    from: params.from ?? ENV.resendFromEmail,
    to: params.to,
    subject: params.subject,
    html: params.html,
  });
  if (error) throw new Error(`Email send failed: ${error.message}`);
  return { id: data?.id ?? "unknown" };
}
