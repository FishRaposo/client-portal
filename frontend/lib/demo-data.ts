// Synthetic demo data for the static build. It mirrors the local seed shape;
// every record is invented for the demo — no real people, clients or payments.

import type { AuditEvent, Approval, Invoice, Me, Note, Project, ProjectDetail, Scope } from "./types";

export const personas: Me[] = [
  { userId: 1, name: "Ada Acme", tenantId: 1, tenant: "Acme Bakery", role: "owner" },
  { userId: 2, name: "Miguel Acme", tenantId: 1, tenant: "Acme Bakery", role: "member" },
  { userId: 3, name: "Vera Acme", tenantId: 1, tenant: "Acme Bakery", role: "viewer" },
];

export const demoProjects: Project[] = [
  { id: 1, name: "Storefront rebuild", status: "active" },
  { id: 2, name: "Newsletter automation", status: "active" },
];

const scopes: Record<number, Scope[]> = {
  1: [{ id: 1, title: "Homepage redesign", acceptance_criteria: "Lighthouse >= 90 on mobile; hero loads from CMS", status: "pending" }],
  2: [],
};

const approvals: Record<number, Approval[]> = {
  1: [{ id: 1, scope_id: 1, status: "pending", decided_at: null, requested_by: "Miguel Acme" }],
  2: [],
};

const notes: Record<number, Note[]> = {
  1: [{ id: 1, body: "Sprint 1: layout primitives and CMS wiring merged.", delivered_at: "2026-11-10T14:00:00Z" }],
  2: [{ id: 2, body: "Kickoff complete; provider credentials pending.", delivered_at: "2026-11-12T09:30:00Z" }],
};

const invoices: Record<number, Invoice[]> = {
  1: [
    { id: 1, amount_cents: 450000, status: "open", checkout_session_id: null, paid_at: null },
    { id: 2, amount_cents: 150000, status: "paid", checkout_session_id: "cs_local_demo1", paid_at: "2026-11-08T11:00:00Z" },
  ],
  2: [],
};

export function demoDetail(id: number): ProjectDetail | null {
  const project = demoProjects.find((p) => p.id === id);
  if (!project) return null;
  return {
    project,
    scopes: scopes[id] ?? [],
    approvals: approvals[id] ?? [],
    notes: notes[id] ?? [],
    invoices: invoices[id] ?? [],
  };
}

export const demoAudit: AuditEvent[] = [
  { id: 7, action: "read", target: "project:3", result: "deny", created_at: "2026-11-18T16:02:00Z", actor: "Vera Acme" },
  { id: 6, action: "read", target: "project:3", result: "deny", created_at: "2026-11-18T15:44:00Z", actor: "Ada Acme" },
  { id: 5, action: "checkout", target: "invoice:1", result: "allow", created_at: "2026-11-18T15:12:00Z", actor: "Ada Acme" },
  { id: 4, action: "request-approval", target: "scope:1", result: "allow", created_at: "2026-11-17T10:20:00Z", actor: "Miguel Acme" },
  { id: 3, action: "write-note", target: "project:1", result: "allow", created_at: "2026-11-10T14:00:00Z", actor: "Miguel Acme" },
  { id: 2, action: "read", target: "project:1", result: "allow", created_at: "2026-11-10T13:58:00Z", actor: "Vera Acme" },
  { id: 1, action: "list", target: "projects", result: "allow", created_at: "2026-11-10T13:55:00Z", actor: "Ada Acme" },
];

// localStorage-backed demo session; only used when NEXT_PUBLIC_DEMO_MODE=true.
const KEY = "portal-demo-persona";
export function demoPersona(): Me {
  if (typeof window === "undefined") return personas[0]!;
  const i = Number(window.localStorage.getItem(KEY) ?? "0");
  return personas[i] ?? personas[0]!;
}
export function setDemoPersona(i: number) {
  window.localStorage.setItem(KEY, String(i));
}
