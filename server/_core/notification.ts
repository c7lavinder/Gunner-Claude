import { sendEmail } from "../emailService";

export type NotificationPayload = {
  title: string;
  content: string;
};

/**
 * Notify the platform owner of important events (new tenant signup, errors, etc.)
 * Uses Resend email instead of the legacy Manus notification service.
 */
export async function notifyOwner(
  payload: NotificationPayload
): Promise<boolean> {
  const title = payload.title?.trim();
  const content = payload.content?.trim();

  if (!title || !content) {
    console.warn("[Notification] notifyOwner called with empty title or content — skipped");
    return false;
  }

  console.log(`[Notification] Owner alert: ${title}`);

  try {
    const sent = await sendEmail({
      to: "corey@newagainhouses.com",
      type: "owner_notification",
      data: { title, content },
    });
    return sent;
  } catch (err) {
    console.warn("[Notification] Failed to send owner notification:", err);
    return false;
  }
}
