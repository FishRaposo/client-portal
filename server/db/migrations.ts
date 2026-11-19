// Ordered SQL migrations, applied by server/db/client.ts at boot.
// Policy design: the GUCs carry identity only (app.tenant_id, app.user_id,
// app.actor). Role is never asserted by the caller — every policy derives it
// from the memberships row, so a forged GUC cannot escalate.

export const MIGRATIONS: { id: string; sql: string }[] = [
  {
    id: "001_init",
    sql: `
CREATE SCHEMA IF NOT EXISTS portal;

CREATE TABLE portal.schema_migrations (
  id text primary key,
  applied_at timestamptz not null default now()
);

CREATE FUNCTION portal.app_tenant() RETURNS int LANGUAGE sql STABLE AS $$
  SELECT nullif(current_setting('app.tenant_id', true), '')::int
$$;
CREATE FUNCTION portal.app_uid() RETURNS int LANGUAGE sql STABLE AS $$
  SELECT nullif(current_setting('app.user_id', true), '')::int
$$;
CREATE FUNCTION portal.app_actor() RETURNS text LANGUAGE sql STABLE AS $$
  SELECT coalesce(nullif(current_setting('app.actor', true), ''), 'user')
$$;
`,
  },
  {
    id: "002_tables",
    sql: `
CREATE TABLE portal.tenants (
  id serial primary key,
  name text not null
);
CREATE TABLE portal.users (
  id serial primary key,
  email text not null unique,
  password_hash text not null,
  name text not null
);
CREATE TABLE portal.memberships (
  tenant_id int not null references portal.tenants(id),
  user_id int not null references portal.users(id),
  role text not null check (role in ('owner','member','viewer')),
  primary key (tenant_id, user_id)
);
CREATE TABLE portal.projects (
  id serial primary key,
  tenant_id int not null references portal.tenants(id),
  name text not null,
  status text not null default 'active'
);
CREATE TABLE portal.scopes (
  id serial primary key,
  project_id int not null references portal.projects(id),
  tenant_id int not null references portal.tenants(id),
  title text not null,
  acceptance_criteria text not null,
  status text not null default 'draft'
    check (status in ('draft','pending','approved','denied'))
);
CREATE TABLE portal.approval_requests (
  id serial primary key,
  scope_id int not null references portal.scopes(id),
  tenant_id int not null references portal.tenants(id),
  requested_by int not null references portal.users(id),
  decided_by int references portal.users(id),
  status text not null default 'pending'
    check (status in ('pending','approved','denied')),
  decided_at timestamptz
);
CREATE TABLE portal.delivery_notes (
  id serial primary key,
  project_id int not null references portal.projects(id),
  tenant_id int not null references portal.tenants(id),
  body text not null,
  delivered_at timestamptz not null default now()
);
CREATE TABLE portal.invoices (
  id serial primary key,
  project_id int not null references portal.projects(id),
  tenant_id int not null references portal.tenants(id),
  amount_cents int not null check (amount_cents >= 0),
  status text not null default 'open' check (status in ('open','paid')),
  checkout_session_id text unique,
  paid_at timestamptz
);
CREATE TABLE portal.webhook_events (
  event_id text primary key,
  type text not null,
  payload_json text not null,
  received_at timestamptz not null default now(),
  processed_at timestamptz
);
CREATE TABLE portal.audit_log (
  id bigserial primary key,
  tenant_id int,
  actor_id int,
  action text not null,
  target text not null,
  result text not null check (result in ('allow','deny')),
  created_at timestamptz not null default now()
);
`,
  },
  {
    id: "003_role_and_policies",
    sql: `
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_user') THEN
    CREATE ROLE app_user NOLOGIN;
  END IF;
END $$;

GRANT USAGE ON SCHEMA portal TO app_user;
GRANT SELECT ON ALL TABLES IN SCHEMA portal TO app_user;
GRANT INSERT, UPDATE ON portal.projects, portal.scopes,
  portal.approval_requests, portal.delivery_notes, portal.memberships,
  portal.invoices, portal.webhook_events, portal.audit_log TO app_user;
GRANT USAGE ON ALL SEQUENCES IN SCHEMA portal TO app_user;

-- Membership-verified role helpers. A caller cannot claim a role; the
-- policy proves it against the memberships row for the acting tenant.
CREATE FUNCTION portal.has_role(required text) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = portal AS $$
  SELECT EXISTS (
    SELECT 1 FROM memberships m
    WHERE m.tenant_id = app_tenant() AND m.user_id = app_uid() AND m.role = required
  )
$$;
CREATE FUNCTION portal.has_any_role() RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = portal AS $$
  SELECT EXISTS (
    SELECT 1 FROM memberships m
    WHERE m.tenant_id = app_tenant() AND m.user_id = app_uid()
  )
$$;
GRANT EXECUTE ON FUNCTION portal.has_role(text), portal.has_any_role() TO app_user;

ALTER TABLE portal.tenants ENABLE ROW LEVEL SECURITY;
ALTER TABLE portal.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE portal.memberships ENABLE ROW LEVEL SECURITY;
ALTER TABLE portal.projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE portal.scopes ENABLE ROW LEVEL SECURITY;
ALTER TABLE portal.approval_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE portal.delivery_notes ENABLE ROW LEVEL SECURITY;
ALTER TABLE portal.invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE portal.webhook_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE portal.audit_log ENABLE ROW LEVEL SECURITY;
`,
  },
  {
    id: "004_policies",
    sql: `
CREATE POLICY tenant_self ON portal.tenants FOR SELECT
  USING (id = portal.app_tenant() AND portal.has_any_role());

-- A user can always see their own row (profile reads); the roster inside a
-- tenant is visible to that tenant's members.
CREATE POLICY user_self ON portal.users FOR SELECT
  USING (id = portal.app_uid() OR portal.has_any_role());

CREATE POLICY membership_read ON portal.memberships FOR SELECT
  USING (tenant_id = portal.app_tenant() AND portal.has_any_role());
CREATE POLICY membership_write ON portal.memberships FOR ALL
  USING (tenant_id = portal.app_tenant() AND portal.has_role('owner'))
  WITH CHECK (tenant_id = portal.app_tenant() AND portal.has_role('owner'));

CREATE POLICY project_read ON portal.projects FOR SELECT
  USING (tenant_id = portal.app_tenant() AND portal.has_any_role());
CREATE POLICY project_write ON portal.projects FOR INSERT
  WITH CHECK (tenant_id = portal.app_tenant()
              AND (portal.has_role('owner') OR portal.has_role('member')));
CREATE POLICY project_update ON portal.projects FOR UPDATE
  USING (tenant_id = portal.app_tenant()
         AND (portal.has_role('owner') OR portal.has_role('member')))
  WITH CHECK (tenant_id = portal.app_tenant()
              AND (portal.has_role('owner') OR portal.has_role('member')));
CREATE POLICY project_delete ON portal.projects FOR DELETE
  USING (tenant_id = portal.app_tenant() AND portal.has_role('owner'));

CREATE POLICY scope_read ON portal.scopes FOR SELECT
  USING (tenant_id = portal.app_tenant() AND portal.has_any_role());
CREATE POLICY scope_write ON portal.scopes FOR INSERT
  WITH CHECK (tenant_id = portal.app_tenant()
              AND (portal.has_role('owner') OR portal.has_role('member')));
CREATE POLICY scope_update ON portal.scopes FOR UPDATE
  USING (tenant_id = portal.app_tenant()
         AND (portal.has_role('owner') OR portal.has_role('member')))
  WITH CHECK (tenant_id = portal.app_tenant()
              AND (portal.has_role('owner') OR portal.has_role('member')));

CREATE POLICY approval_read ON portal.approval_requests FOR SELECT
  USING (tenant_id = portal.app_tenant() AND portal.has_any_role());
CREATE POLICY approval_insert ON portal.approval_requests FOR INSERT
  WITH CHECK (tenant_id = portal.app_tenant()
              AND (portal.has_role('owner') OR portal.has_role('member')));
CREATE POLICY approval_decide ON portal.approval_requests FOR UPDATE
  USING (tenant_id = portal.app_tenant() AND portal.has_role('owner'))
  WITH CHECK (tenant_id = portal.app_tenant() AND portal.has_role('owner'));

CREATE POLICY note_read ON portal.delivery_notes FOR SELECT
  USING (tenant_id = portal.app_tenant() AND portal.has_any_role());
CREATE POLICY note_write ON portal.delivery_notes FOR INSERT
  WITH CHECK (tenant_id = portal.app_tenant()
              AND (portal.has_role('owner') OR portal.has_role('member')));

CREATE POLICY invoice_read ON portal.invoices FOR SELECT
  USING (tenant_id = portal.app_tenant() AND portal.has_any_role());
CREATE POLICY invoice_write ON portal.invoices FOR ALL
  USING (tenant_id = portal.app_tenant() AND portal.has_role('owner'))
  WITH CHECK (tenant_id = portal.app_tenant() AND portal.has_role('owner'));

-- Webhook events are system rows: only the verified webhook actor touches them.
CREATE POLICY webhook_system ON portal.webhook_events FOR ALL
  USING (portal.app_actor() = 'webhook')
  WITH CHECK (portal.app_actor() = 'webhook');

-- Audit is append-only for in-tenant actors; only owners read it.
CREATE POLICY audit_insert ON portal.audit_log FOR INSERT
  WITH CHECK (tenant_id = portal.app_tenant() AND portal.has_any_role());
CREATE POLICY audit_read ON portal.audit_log FOR SELECT
  USING (tenant_id = portal.app_tenant() AND portal.has_role('owner'));

-- Sign-in lookup runs before any session exists; the definer function is the
-- only path that can read a password hash by email.
CREATE FUNCTION portal.verify_login(p_email text)
RETURNS TABLE(id int, password_hash text, name text) LANGUAGE sql
STABLE SECURITY DEFINER SET search_path = portal AS $$
  SELECT u.id, u.password_hash, u.name FROM users u WHERE u.email = p_email
$$;
GRANT EXECUTE ON FUNCTION portal.verify_login(text) TO app_user;

-- Invoice payment is a guarded transition the webhook actor invokes; the
-- definer enforces the only legal edge (open -> paid) and the actor check.
CREATE FUNCTION portal.mark_invoice_paid(p_invoice_id int)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = portal AS $$
BEGIN
  IF app_actor() <> 'webhook' THEN
    RAISE EXCEPTION 'mark_invoice_paid is webhook-only';
  END IF;
  UPDATE invoices SET status = 'paid', paid_at = now()
   WHERE id = p_invoice_id AND status = 'open';
  RETURN FOUND;
END $$;
GRANT EXECUTE ON FUNCTION portal.mark_invoice_paid(int) TO app_user;

-- A verified webhook carries no tenant context; this definer lookup resolves
-- which tenant owns a checkout session so the handler can re-enter with the
-- right context. It exposes nothing else.
CREATE FUNCTION portal.invoice_for_session(p_session text)
RETURNS TABLE(id int, tenant_id int) LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = portal AS $$
  SELECT i.id, i.tenant_id FROM invoices i WHERE i.checkout_session_id = p_session
$$;
GRANT EXECUTE ON FUNCTION portal.invoice_for_session(text) TO app_user;

CREATE FUNCTION portal.user_tenants(p_user int)
RETURNS TABLE(tenant_id int, role text, tenant_name text) LANGUAGE sql
STABLE SECURITY DEFINER SET search_path = portal AS $$
  SELECT m.tenant_id, m.role, t.name FROM memberships m
  JOIN tenants t ON t.id = m.tenant_id WHERE m.user_id = p_user
$$;
GRANT EXECUTE ON FUNCTION portal.user_tenants(int) TO app_user;
`,
  },
];
