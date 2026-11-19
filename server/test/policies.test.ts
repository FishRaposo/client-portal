// @vitest-environment node
// Policy tests run against the real embedded Postgres — the same migrations,
// roles and CREATE POLICY statements the app boots with.
import { beforeAll, describe, expect, it } from "vitest";
import { PortalDb, type Actor } from "../db/client.ts";

let db: PortalDb;
const owner = (t = 1): Actor => ({ tenantId: t, userId: t === 1 ? 1 : 4, actor: "user" });
const member = (t = 1): Actor => ({ tenantId: t, userId: t === 1 ? 2 : 5, actor: "user" });
const viewer = (t = 1): Actor => ({ tenantId: t, userId: 3, actor: "user" });
const stranger: Actor = { tenantId: 1, userId: 6, actor: "user" };

beforeAll(async () => {
  db = await PortalDb.open();
});

describe("tenant isolation", () => {
  it("tenant 1 sees only its own projects", async () => {
    const rows = await db.tx(owner(), (q) => q("SELECT id FROM portal.projects ORDER BY id"));
    expect(rows.map((r) => r.id)).toEqual([1, 2]);
  });

  it("cross-tenant read returns no rows", async () => {
    const rows = await db.tx(owner(1), (q) => q("SELECT id FROM portal.projects WHERE id = 3"));
    expect(rows).toEqual([]);
  });

  it("cross-tenant write violates the policy", async () => {
    await expect(
      db.tx(owner(1), (q) => q("INSERT INTO portal.projects (tenant_id,name) VALUES (2,'x')")),
    ).rejects.toThrow(/row-level security/);
  });

  it("cross-tenant update silently affects no rows", async () => {
    const r = await db.tx(owner(1), (q) =>
      q("UPDATE portal.projects SET name='x' WHERE id=3 RETURNING id"),
    );
    expect(r).toEqual([]);
  });
});

describe("role matrix", () => {
  it("member can insert a delivery note", async () => {
    const r = await db.tx(member(1), (q) =>
      q("INSERT INTO portal.delivery_notes (project_id,tenant_id,body) VALUES (1,1,'m') RETURNING id"),
    );
    expect(r.length).toBe(1);
  });

  it("viewer cannot write", async () => {
    await expect(
      db.tx(viewer(), (q) =>
        q("INSERT INTO portal.delivery_notes (project_id,tenant_id,body) VALUES (1,1,'v')"),
      ),
    ).rejects.toThrow(/row-level security/);
  });

  it("member cannot decide an approval (silently filtered)", async () => {
    const r = await db.tx(member(1), (q) =>
      q("UPDATE portal.approval_requests SET status='approved',decided_by=portal.app_uid() WHERE id=1 RETURNING id"),
    );
    expect(r).toEqual([]);
    const after = await db.tx(owner(1), (q) => q("SELECT status FROM portal.approval_requests WHERE id=1"));
    expect(after[0]!.status).toBe("pending");
  });

  it("owner decides an approval", async () => {
    const r = await db.tx(owner(1), (q) =>
      q("UPDATE portal.approval_requests SET status='approved',decided_by=portal.app_uid(),decided_at=now() WHERE id=1 RETURNING id"),
    );
    expect(r.length).toBe(1);
  });

  it("member cannot write an invoice (silently filtered)", async () => {
    const r = await db.tx(member(1), (q) =>
      q("UPDATE portal.invoices SET checkout_session_id='cs_local_x' WHERE id=1 RETURNING id"),
    );
    expect(r).toEqual([]);
  });

  it("no membership sees nothing", async () => {
    const rows = await db.tx(stranger, (q) => q("SELECT id FROM portal.projects"));
    expect(rows).toEqual([]);
    await expect(
      db.tx(stranger, (q) => q("INSERT INTO portal.audit_log (tenant_id,action,target,result) VALUES (1,'x','y','allow')")),
    ).rejects.toThrow(/row-level security/);
  });
});

describe("role is read from memberships, not asserted", () => {
  it("a user whose membership is viewer cannot act as owner even via SQL-level tricks", async () => {
    // The app never sets an app.role GUC; the policy consults memberships.
    // Prove it: viewer (uid 3) performing an owner-only UPDATE is filtered.
    const r = await db.tx(viewer(), (q) =>
      q("UPDATE portal.invoices SET status='open' WHERE id=2 RETURNING id"),
    );
    expect(r).toEqual([]);
  });
});

describe("audit log", () => {
  it("members can append, only owner can read", async () => {
    await db.tx(member(1), (q) =>
      q("INSERT INTO portal.audit_log (tenant_id,actor_id,action,target,result) VALUES (portal.app_tenant(),portal.app_uid(),'t','t','deny')"),
    );
    const ownerRows = await db.tx(owner(1), (q) => q("SELECT id FROM portal.audit_log"));
    expect(ownerRows.length).toBeGreaterThan(0);
    const memberRows = await db.tx(member(1), (q) => q("SELECT id FROM portal.audit_log"));
    expect(memberRows).toEqual([]);
  });
});
