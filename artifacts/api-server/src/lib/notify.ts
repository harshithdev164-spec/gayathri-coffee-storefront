import { logger } from "./logger";

// Runs customer/admin notifications and waits for all of them. On Vercel (serverless) the
// function is frozen as soon as the response is sent, so fire-and-forget messages never
// leave. One failing message must never fail the order, so errors are logged, not thrown.
export async function sendNotifications(context: string, notifications: Promise<unknown>[]): Promise<void> {
  const results = await Promise.allSettled(notifications);
  for (const result of results) {
    if (result.status === "rejected") logger.error({ err: result.reason, context }, "Notification failed");
  }
}
