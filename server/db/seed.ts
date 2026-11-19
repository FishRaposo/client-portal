// Deterministic seed: two synthetic tenants with owner/member/viewer users,
// projects, one pending scope approval, delivery notes and invoices — plus a
// user with no membership anywhere for the denial path. No real people.

import { hashPassword } from "../auth.ts";

export function seedSql(): string {
  const pw = (label: string) => `'${hashPassword(label)}'`;
  return `
INSERT INTO portal.tenants (name) VALUES ('Acme Bakery'),('Northwind Tools');
INSERT INTO portal.users (email, password_hash, name) VALUES
  ('owner@acme.example',    ${pw("owner-pass")},    'Ada Acme'),
  ('member@acme.example',   ${pw("member-pass")},   'Miguel Acme'),
  ('viewer@acme.example',   ${pw("viewer-pass")},   'Vera Acme'),
  ('owner@northwind.example', ${pw("owner2-pass")}, 'Nora North'),
  ('member@northwind.example', ${pw("member2-pass")}, 'Marco North'),
  ('stranger@example.org',  ${pw("stranger-pass")}, 'Sam Stranger');
INSERT INTO portal.memberships (tenant_id, user_id, role) VALUES
  (1,1,'owner'),(1,2,'member'),(1,3,'viewer'),
  (2,4,'owner'),(2,5,'member');
INSERT INTO portal.projects (tenant_id, name, status) VALUES
  (1,'Storefront rebuild','active'),
  (1,'Newsletter automation','active'),
  (2,'Inventory sync','active');
INSERT INTO portal.scopes (project_id, tenant_id, title, acceptance_criteria, status) VALUES
  (1,1,'Homepage redesign','Lighthouse >= 90 on mobile; hero loads from CMS','pending'),
  (3,2,'CSV import','10k rows in < 60s; dry-run report before write','pending');
INSERT INTO portal.approval_requests (scope_id, tenant_id, requested_by, status) VALUES
  (1,1,2,'pending'),
  (2,2,5,'pending');
INSERT INTO portal.delivery_notes (project_id, tenant_id, body) VALUES
  (1,1,'Sprint 1: layout primitives and CMS wiring merged.'),
  (3,2,'Parser spike complete; see validation report.');
INSERT INTO portal.invoices (project_id, tenant_id, amount_cents, status) VALUES
  (1,1,450000,'open'),
  (2,1,150000,'paid'),
  (3,2,300000,'open');
UPDATE portal.invoices SET paid_at = now() WHERE id = 2;
`;
}

export const SEED_SQL = seedSql();
