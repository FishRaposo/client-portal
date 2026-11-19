// Minimal REST surface over node:http. Every handler resolves the session,
// then calls db.tx() so the request's queries run as app_user under the
// caller's tenant context. Policies — not this file — decide access; a denied
// or empty result is turned into 404/403 and an audit row where possible.

import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import type { PortalDb } from "./db/client.ts";
import {
  clearCookie,
  readSession,
  sessionCookie,
  signSession,
  verifyPassword,
  type Session,
} from "./auth.ts";
import { checkoutSessionId, signPayload, verifySignature, WEBHOOK_SECRET } from "./stripe.ts";

interface Ctx {
  db: PortalDb;
  session: Session;
}

type Handler = (
  ctx: Ctx,
  req: IncomingMessage,
  params: Record<string, string>,
  body: unknown,
  raw: string,
) => Promise<{ status: number; body?: unknown; headers?: Record<string, string> }>;

const json = (res: ServerResponse, status: number, body: unknown, headers: Record<string, string> = {}) => {
  const isErr = typeof body === "object" && body !== null && "error" in body;
  const payload = isErr
    ? body
    : { data: body ?? {}, meta: { request_id: crypto.randomUUID() } };
  res.writeHead(status, { "content-type": "application/json", ...headers });
  res.end(JSON.stringify(payload));
};

const errBody = (code: string, message: string) => ({ error: { code, message } });

async function audit(ctx: Ctx, action: string, target: string, result: "allow" | "deny") {
  try {
    await ctx.db.tx(
      { tenantId: ctx.session.tenantId, userId: ctx.session.userId, actor: "user" },
      (q) =>
        q(
          "INSERT INTO portal.audit_log (tenant_id, actor_id, action, target, result) VALUES (portal.app_tenant(), portal.app_uid(), $1, $2, $3)",
          [action, target, result],
        ),
    );
  } catch {
    // A user with no membership cannot append audit rows; documented limit.
  }
}

const routes: [RegExp, string, Handler][] = [
  [
    /^\/api\/login$/,
    "POST",
    async (ctx, _req, _p, body) => {
      const { email, password } = (body ?? {}) as { email?: string; password?: string };
      if (!email || !password) return { status: 400, body: errBody("bad_request", "email and password required") };
      const rows = await ctx.db.system<{ id: number; password_hash: string; name: string }>(
        "SELECT * FROM portal.verify_login($1)",
        [email],
      );
      const user = rows[0];
      if (!user || !verifyPassword(password, user.password_hash)) {
        return { status: 401, body: errBody("invalid_credentials", "invalid credentials") };
      }
      const tenants = await ctx.db.system<{ tenant_id: number; role: string; tenant_name: string }>(
        "SELECT * FROM portal.user_tenants($1)",
        [user.id],
      );
      if (tenants.length === 0) {
        return { status: 403, body: { ...errBody("no_membership", "no tenant membership"), name: user.name } };
      }
      const t = tenants[0]!;
      return {
        status: 200,
        body: { userId: user.id, name: user.name, tenantId: t.tenant_id, tenant: t.tenant_name, role: t.role },
        headers: { "set-cookie": sessionCookie(signSession(user.id, t.tenant_id, t.role)) },
      };
    },
  ],
  [
    /^\/api\/logout$/,
    "POST",
    async () => ({ status: 200, body: { ok: true }, headers: { "set-cookie": clearCookie() } }),
  ],
  [
    /^\/api\/me$/,
    "GET",
    async (ctx) => {
      const t = await ctx.db.tx(actorOf(ctx), (q) =>
        q("SELECT t.name FROM portal.tenants t WHERE t.id = portal.app_tenant()"),
      );
      return { status: 200, body: { ...ctx.session, tenant: t[0]?.name ?? null } };
    },
  ],
  [
    /^\/api\/projects$/,
    "GET",
    async (ctx) => {
      const rows = await ctx.db.tx(actorOf(ctx), (q) =>
        q("SELECT id, name, status FROM portal.projects ORDER BY id"),
      );
      await audit(ctx, "list", "projects", "allow");
      return { status: 200, body: { projects: rows } };
    },
  ],
  [
    /^\/api\/projects\/(\d+)$/,
    "GET",
    async (ctx, _req, p) => {
      const rows = await ctx.db.tx(actorOf(ctx), async (q) => {
        const project = await q("SELECT id, name, status FROM portal.projects WHERE id = $1", [p.id]);
        if (project.length === 0) return null;
        const scopes = await q("SELECT id, title, acceptance_criteria, status FROM portal.scopes WHERE project_id = $1 ORDER BY id", [p.id]);
        const approvals = await q(
          `SELECT a.id, a.scope_id, a.status, a.decided_at, u.name AS requested_by
             FROM portal.approval_requests a JOIN portal.users u ON u.id = a.requested_by
            WHERE a.scope_id IN (SELECT id FROM portal.scopes WHERE project_id = $1) ORDER BY a.id`,
          [p.id],
        );
        const notes = await q("SELECT id, body, delivered_at FROM portal.delivery_notes WHERE project_id = $1 ORDER BY id", [p.id]);
        const invoices = await q("SELECT id, amount_cents, status, checkout_session_id, paid_at FROM portal.invoices WHERE project_id = $1 ORDER BY id", [p.id]);
        return { project: project[0], scopes, approvals, notes, invoices };
      });
      if (rows === null) {
        await audit(ctx, "read", `project:${p.id}`, "deny");
        return { status: 404, body: errBody("denied", "not found or not accessible") };
      }
      await audit(ctx, "read", `project:${p.id}`, "allow");
      return { status: 200, body: rows };
    },
  ],
  [
    /^\/api\/scopes\/(\d+)\/request-approval$/,
    "POST",
    async (ctx, _req, p) => {
      try {
        const out = await ctx.db.tx(actorOf(ctx), async (q) => {
          await q("UPDATE portal.scopes SET status='pending' WHERE id = $1", [p.id]);
          const r = await q(
            "INSERT INTO portal.approval_requests (scope_id, tenant_id, requested_by) VALUES ($1, portal.app_tenant(), portal.app_uid()) RETURNING id",
            [p.id],
          );
          return r[0];
        });
        if (!out) {
          await audit(ctx, "request-approval", `scope:${p.id}`, "deny");
          return { status: 404, body: errBody("denied", "scope not found or not writable") };
        }
        await audit(ctx, "request-approval", `scope:${p.id}`, "allow");
        return { status: 200, body: { approvalId: out.id } };
      } catch {
        await audit(ctx, "request-approval", `scope:${p.id}`, "deny");
        return { status: 403, body: errBody("denied", "denied") };
      }
    },
  ],
  [
    /^\/api\/approvals\/(\d+)\/decide$/,
    "POST",
    async (ctx, _req, p, body) => {
      const { status } = (body ?? {}) as { status?: string };
      if (status !== "approved" && status !== "denied") {
        return { status: 400, body: errBody("bad_request", "status must be approved|denied") };
      }
      try {
        const decided = await ctx.db.tx(actorOf(ctx), async (q) => {
          const upd = await q(
            `UPDATE portal.approval_requests SET status=$1, decided_by=portal.app_uid(), decided_at=now()
              WHERE id=$2 AND status='pending' RETURNING scope_id`,
            [status, p.id],
          );
          if (upd.length === 0) return false;
          await q("UPDATE portal.scopes SET status=$1 WHERE id=$2", [status, upd[0]!.scope_id]);
          return true;
        });
        if (!decided) {
          await audit(ctx, "decide", `approval:${p.id}`, "deny");
          return { status: 404, body: errBody("denied", "not found, decided, or not permitted") };
        }
        await audit(ctx, "decide", `approval:${p.id}`, "allow");
        return { status: 200, body: { status } };
      } catch {
        await audit(ctx, "decide", `approval:${p.id}`, "deny");
        return { status: 403, body: errBody("denied", "denied") };
      }
    },
  ],
  [
    /^\/api\/notes$/,
    "POST",
    async (ctx, _req, _p, body) => {
      const { project_id, body: noteBody } = (body ?? {}) as { project_id?: number; body?: string };
      if (!project_id || !noteBody) return { status: 400, body: errBody("bad_request", "project_id and body required") };
      try {
        const r = await ctx.db.tx(actorOf(ctx), (q) =>
          q(
            "INSERT INTO portal.delivery_notes (project_id, tenant_id, body) VALUES ($1, portal.app_tenant(), $2) RETURNING id",
            [project_id, noteBody],
          ),
        );
        if (r.length === 0) {
          await audit(ctx, "write-note", `project:${project_id}`, "deny");
          return { status: 404, body: errBody("denied", "project not found or not writable") };
        }
        await audit(ctx, "write-note", `project:${project_id}`, "allow");
        return { status: 200, body: { noteId: r[0]!.id } };
      } catch {
        await audit(ctx, "write-note", `project:${project_id}`, "deny");
        return { status: 403, body: errBody("denied", "denied") };
      }
    },
  ],
  [
    /^\/api\/invoices\/(\d+)\/checkout$/,
    "POST",
    async (ctx, _req, p) => {
      const r = await ctx.db.tx(actorOf(ctx), (q) =>
        q(
          "UPDATE portal.invoices SET checkout_session_id=$1 WHERE id=$2 AND status='open' RETURNING id",
          [checkoutSessionId(Number(p.id)), p.id],
        ),
      );
      if (r.length === 0) {
        await audit(ctx, "checkout", `invoice:${p.id}`, "deny");
        return { status: 404, body: errBody("denied", "invoice not found, paid, or not permitted") };
      }
      await audit(ctx, "checkout", `invoice:${p.id}`, "allow");
      const sessionId = checkoutSessionId(Number(p.id));
      return { status: 200, body: { sessionId, checkoutUrl: `/checkout/${sessionId}/` } };
    },
  ],
  [
    // Local stand-in for Stripe's hosted checkout + event delivery: it signs a
    // checkout.session.completed event with the local secret and posts it to
    // this server's real webhook endpoint — the same signature verification
    // and idempotency path a live delivery takes. Local only, never a real
    // payment.
    /^\/api\/checkout\/([^/]+)\/complete$/,
    "POST",
    async (ctx, _req, p) => {
      const session = p.id;
      const event = {
        id: `evt_local_${session.replace(/^cs_/, "")}`,
        type: "checkout.session.completed",
        data: { object: { id: session } },
      };
      const raw = JSON.stringify(event);
      const signature = signPayload(raw);
      const port = Number(process.env.PORTAL_API_PORT ?? 4100);
      const res = await fetch(`http://localhost:${port}/api/webhooks/stripe`, {
        method: "POST",
        headers: { "content-type": "application/json", "stripe-signature": signature },
        body: raw,
      });
      const payload = (await res.json()) as { outcome?: string };
      if (ctx.session.userId) {
        await audit(ctx, "pay", `session:${session}`, res.ok ? "allow" : "deny");
      }
      return { status: res.status, body: { outcome: payload.outcome ?? "unknown", sessionId: session, secret: WEBHOOK_SECRET === "whsec_local_dev_only" ? "local-dev" : "env" } };
    },
  ],
  [
    /^\/api\/webhooks\/stripe$/,
    "POST",
    async (ctx, req, _p, _body, raw) => {
      const sig = verifySignature(raw, headerOf(req, "stripe-signature"));
      if (!sig.ok) return { status: 400, body: errBody("invalid_signature", sig.reason) };
      let event: { id?: string; type?: string; data?: { object?: { id?: string } } };
      try {
        event = JSON.parse(raw);
      } catch {
        return { status: 400, body: errBody("bad_request", "invalid json") };
      }
      if (!event.id || !event.type) return { status: 400, body: errBody("bad_request", "malformed event") };
      // Record the verified event first (idempotency anchor). The definer
      // function resolves the owning invoice — the webhook actor cannot read
      // invoices under invoice_read and must never see other tenants' rows.
      const outcome = await ctx.db.tx(
        { tenantId: 0, userId: 0, actor: "webhook" },
        async (q) => {
          const ins = await q(
            "INSERT INTO portal.webhook_events (event_id, type, payload_json) VALUES ($1,$2,$3) ON CONFLICT (event_id) DO NOTHING RETURNING event_id",
            [event.id, event.type, raw],
          );
          if (ins.length === 0) return "already_processed";
          let invoiceId: number | null = null;
          let tenantId: number | null = null;
          if (event.type === "checkout.session.completed") {
            const rows = await q("SELECT * FROM portal.invoice_for_session($1)", [
              event.data?.object?.id ?? "",
            ]);
            invoiceId = (rows[0]?.id as number) ?? null;
            tenantId = (rows[0]?.tenant_id as number) ?? null;
          }
          await q("UPDATE portal.webhook_events SET processed_at=now() WHERE event_id=$1", [event.id]);
          return { invoiceId, tenantId };
        },
      );
      if (outcome === "already_processed") {
        return { status: 200, body: { outcome } };
      }
      if (outcome.invoiceId && outcome.tenantId) {
        // The definer function enforces webhook-only caller and open->paid.
        await ctx.db.tx(
          { tenantId: outcome.tenantId, userId: 0, actor: "webhook" },
          (q) => q("SELECT portal.mark_invoice_paid($1)", [outcome.invoiceId]),
        );
      }
      return { status: 200, body: { outcome: outcome.invoiceId ? "processed" : "processed_no_invoice" } };
      return { status: 200, body: { outcome } };
    },
  ],
  [
    /^\/api\/audit$/,
    "GET",
    async (ctx) => {
      const rows = await ctx.db.tx(actorOf(ctx), (q) =>
        q(
          `SELECT a.id, a.action, a.target, a.result, a.created_at, u.name AS actor
             FROM portal.audit_log a LEFT JOIN portal.users u ON u.id = a.actor_id
            ORDER BY a.id DESC LIMIT 100`,
        ),
      );
      return { status: 200, body: { events: rows } };
    },
  ],
];

function actorOf(ctx: Ctx) {
  return { tenantId: ctx.session.tenantId, userId: ctx.session.userId, actor: "user" as const };
}

function headerOf(req: IncomingMessage, name: string): string | undefined {
  const v = req.headers[name];
  return Array.isArray(v) ? v[0] : v;
}

function readRaw(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

export function buildServer(db: PortalDb) {
  return createServer(async (req, res) => {
    res.setHeader("access-control-allow-origin", process.env.PORTAL_CORS_ORIGIN ?? "http://localhost:3110");
    res.setHeader("access-control-allow-headers", "content-type, stripe-signature");
    res.setHeader("access-control-allow-credentials", "true");
    if (req.method === "OPTIONS") {
      res.writeHead(204);
      res.end();
      return;
    }
    const url = new URL(req.url ?? "/", "http://localhost");
    const session = readSession(headerOf(req, "cookie"));
    const isPublic = /^\/api\/(login|webhooks\/stripe)$/.test(url.pathname) || req.method === "OPTIONS";
    if (!session && !isPublic) {
      json(res, 401, errBody("unauthorized", "not signed in"));
      return;
    }
    const raw = await readRaw(req);
    let body: unknown = {};
    if (raw && !url.pathname.startsWith("/api/webhooks/")) {
      try {
        body = JSON.parse(raw);
      } catch {
        json(res, 400, errBody("bad_request", "invalid json"));
        return;
      }
    }
    for (const [re, method, handler] of routes) {
      const m = re.exec(url.pathname);
      if (!m || method !== req.method) continue;
      const params = { id: m[1] ?? "" };
      const ctx: Ctx = { db, session: session ?? { userId: 0, tenantId: 0, role: "anon" } };
      try {
        const out = await handler(ctx, req, params, body, raw);
        json(res, out.status, out.body, out.headers);
      } catch (err) {
        json(res, 500, errBody("internal", err instanceof Error ? err.message : "internal error"));
      }
      return;
    }
    json(res, 404, errBody("not_found", "no such route"));
  });
}
