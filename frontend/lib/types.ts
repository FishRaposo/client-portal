export interface Me {
  userId: number;
  name: string;
  tenantId: number;
  tenant: string;
  role: "owner" | "member" | "viewer";
}

export interface Project {
  id: number;
  name: string;
  status: string;
}

export interface Scope {
  id: number;
  title: string;
  acceptance_criteria: string;
  status: "draft" | "pending" | "approved" | "denied";
}

export interface Approval {
  id: number;
  scope_id: number;
  status: "pending" | "approved" | "denied";
  decided_at: string | null;
  requested_by: string;
}

export interface Note {
  id: number;
  body: string;
  delivered_at: string;
}

export interface Invoice {
  id: number;
  amount_cents: number;
  status: "open" | "paid";
  checkout_session_id: string | null;
  paid_at: string | null;
}

export interface ProjectDetail {
  project: Project;
  scopes: Scope[];
  approvals: Approval[];
  notes: Note[];
  invoices: Invoice[];
}

export interface AuditEvent {
  id: number;
  action: string;
  target: string;
  result: "allow" | "deny";
  created_at: string;
  actor: string | null;
}
