export type Role = "superadmin" | "finance" | "logistics";
export const ROLES: Role[] = ["superadmin", "finance", "logistics"];

export type Permission =
  | "orders.view" //   see orders and customer / delivery details
  | "orders.edit" //   add offline orders, edit orders before they ship, check Razorpay payments
  | "orders.ship" //   shipping, tracking, AWB labels, pickup, India Post tracking, order status
  | "orders.invoice" // download / print invoices
  | "payments" //      check Razorpay payments
  | "analytics" //     analytics dashboard
  | "export" //        full Excel export (tracking sheet is available to everyone who can view orders)
  | "packing" //       packing-team WhatsApp recipients
  | "products"
  | "settings"
  | "whatsapp" //      WhatsApp chats and replies
  | "wallet" //        Shiprocket wallet balance on the dashboard
  | "users"; //        add / change / deactivate team members, see the audit log

const FINANCE: Permission[] = ["orders.view", "orders.edit", "orders.invoice", "payments", "analytics", "export", "wallet"];
// Logistics can look at orders and handle WhatsApp chats - nothing else.
const LOGISTICS: Permission[] = ["orders.view", "whatsapp"];
const ALL: Permission[] = [
  "orders.view", "orders.edit", "orders.ship", "orders.invoice", "payments", "analytics", "export",
  "packing", "products", "settings", "whatsapp", "wallet", "users",
];

export const ROLE_PERMISSIONS: Record<Role, Permission[]> = { superadmin: ALL, finance: FINANCE, logistics: LOGISTICS };

export function isRole(value: unknown): value is Role {
  return typeof value === "string" && (ROLES as string[]).includes(value);
}

export function permissionsFor(role: string): Permission[] {
  return isRole(role) ? ROLE_PERMISSIONS[role] : [];
}

export function can(role: string, ...anyOf: Permission[]): boolean {
  const have = permissionsFor(role);
  return anyOf.some((permission) => have.includes(permission));
}
