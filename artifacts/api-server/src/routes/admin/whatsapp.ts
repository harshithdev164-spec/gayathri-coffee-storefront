import { Router, type IRouter } from "express";
import { z } from "zod";
import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";
import { db, ordersTable, whatsappEventsTable } from "@workspace/db";
import { requireAdmin } from "../../middlewares/require-admin";
import { isWhatsAppConfigured, sendFollowUpTemplate, sendWhatsAppText } from "../../lib/whatsapp";

const router: IRouter = Router();
router.use(requireAdmin);

// WhatsApp only allows free-form messages for 24 hours after the customer's last message to us.
const WINDOW_MS = 24 * 60 * 60 * 1000;

const CHAT_TYPES = ["inbound_message", "bot_reply", "agent_reply", "message_sent"] as const;
// Thread views also show the moments the bot asked the team to step in.
const THREAD_TYPES = [...CHAT_TYPES, "handoff"] as const;
type ChatType = (typeof CHAT_TYPES)[number];

const last10 = (phone: string) => phone.replace(/\D/g, "").slice(-10);

function windowFor(lastInboundAt: Date | null) {
  if (!lastInboundAt) return { open: false, endsAt: null as string | null, msLeft: 0 };
  const endsAt = lastInboundAt.getTime() + WINDOW_MS;
  const msLeft = Math.max(0, endsAt - Date.now());
  return { open: msLeft > 0, endsAt: new Date(endsAt).toISOString(), msLeft };
}

function previewOf(type: ChatType, body: string | null, templateName: string | null): string {
  if (type === "message_sent") return `Template: ${templateName ?? "message"}`;
  return (body ?? "").replace(/\s+/g, " ").slice(0, 90);
}

// One row per customer: who they are, their last message and whether the 24-hour window is still open.
router.get("/whatsapp/conversations", async (_req, res) => {
  const rows = await db
    .select({
      phone: whatsappEventsTable.fromPhone,
      lastAt: sql<Date>`max(${whatsappEventsTable.createdAt})`,
      lastInboundAt: sql<Date | null>`max(${whatsappEventsTable.createdAt}) filter (where ${whatsappEventsTable.type} = 'inbound_message')`,
    })
    .from(whatsappEventsTable)
    .where(and(inArray(whatsappEventsTable.type, [...CHAT_TYPES]), sql`${whatsappEventsTable.fromPhone} is not null`))
    .groupBy(whatsappEventsTable.fromPhone)
    .orderBy(desc(sql`max(${whatsappEventsTable.createdAt})`))
    .limit(100);

  // Only customers who have written to us belong in the inbox; outbound-only alerts to admins/packers don't.
  const chats = rows.filter((row) => row.phone && row.lastInboundAt);
  if (chats.length === 0) {
    res.json([]);
    return;
  }

  const phones = chats.map((c) => c.phone as string);
  const last = await db
    .select()
    .from(whatsappEventsTable)
    .where(
      and(
        inArray(whatsappEventsTable.fromPhone, phones),
        inArray(whatsappEventsTable.type, [...CHAT_TYPES]),
        sql`${whatsappEventsTable.createdAt} = (select max(e.created_at) from whatsapp_events e where e.from_phone = ${whatsappEventsTable.fromPhone} and e.type in ('inbound_message','bot_reply','agent_reply','message_sent'))`,
      ),
    );
  const lastByPhone = new Map(last.map((event) => [event.fromPhone as string, event]));

  // A chat "needs a person" when the bot handed it over and nobody on the team has answered since.
  const handoffRows = await db
    .select({
      phone: whatsappEventsTable.fromPhone,
      handoffAt: sql<Date>`max(${whatsappEventsTable.createdAt}) filter (where ${whatsappEventsTable.type} = 'handoff')`,
      agentAt: sql<Date | null>`max(${whatsappEventsTable.createdAt}) filter (where ${whatsappEventsTable.type} = 'agent_reply')`,
    })
    .from(whatsappEventsTable)
    .where(and(inArray(whatsappEventsTable.fromPhone, phones), inArray(whatsappEventsTable.type, ["handoff", "agent_reply"])))
    .groupBy(whatsappEventsTable.fromPhone);
  const needsHumanByPhone = new Map<string, boolean>();
  for (const row of handoffRows) {
    if (!row.phone || !row.handoffAt) continue;
    const handoffAt = new Date(row.handoffAt).getTime();
    needsHumanByPhone.set(row.phone, !row.agentAt || new Date(row.agentAt).getTime() < handoffAt);
  }

  const orders = await db.select({ name: ordersTable.customerName, phone: ordersTable.phone, createdAt: ordersTable.createdAt }).from(ordersTable).orderBy(desc(ordersTable.createdAt));
  const nameByLast10 = new Map<string, string>();
  for (const order of orders) if (!nameByLast10.has(last10(order.phone))) nameByLast10.set(last10(order.phone), order.name);

  res.json(
    chats.map((chat) => {
      const phone = chat.phone as string;
      const lastEvent = lastByPhone.get(phone);
      const win = windowFor(chat.lastInboundAt ? new Date(chat.lastInboundAt) : null);
      return {
        phone,
        name: nameByLast10.get(last10(phone)) ?? null,
        lastMessage: lastEvent ? previewOf(lastEvent.type as ChatType, lastEvent.body, lastEvent.templateName) : "",
        lastAt: new Date(chat.lastAt).toISOString(),
        // The customer spoke last and nobody (person or bot) has answered yet.
        needsReply: lastEvent?.type === "inbound_message",
        needsHuman: needsHumanByPhone.get(phone) ?? false,
        windowOpen: win.open,
        windowEndsAt: win.endsAt,
        windowMsLeft: win.msLeft,
      };
    }),
  );
});

router.get("/whatsapp/conversations/:phone", async (req, res) => {
  const phone = req.params.phone.replace(/\D/g, "");
  const events = await db
    .select()
    .from(whatsappEventsTable)
    .where(and(eq(whatsappEventsTable.fromPhone, phone), inArray(whatsappEventsTable.type, [...THREAD_TYPES])))
    .orderBy(desc(whatsappEventsTable.createdAt))
    .limit(150);
  events.reverse();

  const lastInbound = [...events].reverse().find((event) => event.type === "inbound_message");
  const win = windowFor(lastInbound ? lastInbound.createdAt : null);

  const orders = await db
    .select({ orderNumber: ordersTable.orderNumber, status: ordersTable.status, total: ordersTable.total, createdAt: ordersTable.createdAt, name: ordersTable.customerName, phone: ordersTable.phone })
    .from(ordersTable)
    .where(sql`right(regexp_replace(${ordersTable.phone}, '\D', '', 'g'), 10) = ${last10(phone)}`)
    .orderBy(desc(ordersTable.createdAt))
    .limit(5);

  res.json({
    phone,
    name: orders[0]?.name ?? null,
    windowOpen: win.open,
    windowEndsAt: win.endsAt,
    windowMsLeft: win.msLeft,
    orders: orders.map((order) => ({ orderNumber: order.orderNumber, status: order.status, total: order.total, createdAt: order.createdAt.toISOString() })),
    messages: events.map((event) => ({
      id: event.id,
      direction: event.type === "inbound_message" ? "in" : event.type === "handoff" ? "note" : "out",
      kind: event.type === "bot_reply" ? "bot" : event.type === "agent_reply" ? "team" : event.type === "message_sent" ? "template" : event.type === "handoff" ? "handoff" : "customer",
      body: event.type === "message_sent" ? null : event.body,
      templateName: event.templateName,
      status: event.status,
      at: event.createdAt.toISOString(),
    })),
  });
});

const ReplyBody = z.object({ text: z.string().trim().min(1).max(4000) });

router.post("/whatsapp/conversations/:phone/reply", async (req, res) => {
  const parsed = ReplyBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Type a message to send." });
    return;
  }
  if (!isWhatsAppConfigured()) {
    res.status(503).json({ error: "WhatsApp isn't connected on this server." });
    return;
  }

  const phone = req.params.phone.replace(/\D/g, "");
  const [lastInbound] = await db
    .select({ createdAt: whatsappEventsTable.createdAt })
    .from(whatsappEventsTable)
    .where(and(eq(whatsappEventsTable.fromPhone, phone), eq(whatsappEventsTable.type, "inbound_message")))
    .orderBy(desc(whatsappEventsTable.createdAt))
    .limit(1);

  // Enforced here too, not just in the screen — WhatsApp would reject it anyway, and an
  // account that keeps breaking the rule risks restrictions.
  if (!windowFor(lastInbound?.createdAt ?? null).open) {
    res.status(409).json({ error: "The 24-hour reply window has closed. Send the follow-up template instead, and reply once the customer answers." });
    return;
  }

  try {
    await sendWhatsAppText(phone, parsed.data.text, "agent_reply");
    res.json({ ok: true });
  } catch (err) {
    res.status(502).json({ error: err instanceof Error ? err.message : "WhatsApp could not deliver the message." });
  }
});

// Re-opens a closed conversation with the approved follow-up template.
router.post("/whatsapp/conversations/:phone/follow-up", async (req, res) => {
  if (!isWhatsAppConfigured()) {
    res.status(503).json({ error: "WhatsApp isn't connected on this server." });
    return;
  }
  const phone = req.params.phone.replace(/\D/g, "");
  const [order] = await db
    .select({ name: ordersTable.customerName })
    .from(ordersTable)
    .where(sql`right(regexp_replace(${ordersTable.phone}, '\D', '', 'g'), 10) = ${last10(phone)}`)
    .orderBy(desc(ordersTable.createdAt))
    .limit(1);
  try {
    await sendFollowUpTemplate(phone, (order?.name ?? "").split(/\s+/)[0] ?? "");
    res.json({ ok: true });
  } catch (err) {
    res.status(502).json({
      error: /132001|not (found|approved)|does not exist/i.test(String(err))
        ? "The follow-up template isn't approved by WhatsApp yet. Try again once Meta approves gc_follow_up_v1."
        : err instanceof Error ? err.message : "WhatsApp could not deliver the template.",
    });
  }
});

export default router;
