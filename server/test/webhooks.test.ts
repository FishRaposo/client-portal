// @vitest-environment node
import { beforeAll, describe, expect, it } from "vitest";
import { PortalDb } from "../db/client.ts";
import { buildServer } from "../http.ts";
import { checkoutSessionId, signPayload, WEBHOOK_SECRET } from "../stripe.ts";
import { signSession } from "../auth.ts";
import type { AddressInfo } from "node:net";

let base: string;
let db: PortalDb;

beforeAll(async () => {
  db = await PortalDb.open();
  const server = buildServer(db);
  await new Promise<void>((r) => server.listen(0, r));
  base = `http://localhost:${(server.address() as AddressInfo).port}`;
});

const ownerCookie = `portal_session=${signSession(1, 1, "owner")}`;

function event(id: string, session: string) {
  return JSON.stringify({ id, type: "checkout.session.completed", data: { object: { id: session } } });
}

async function webhook(raw: string, sig?: string) {
  return fetch(`${base}/api/webhooks/stripe`, {
    method: "POST",
    headers: { "content-type": "application/json", ...(sig ? { "stripe-signature": sig } : {}) },
    body: raw,
  });
}

describe("stripe signature verification", () => {
  it("accepts a correctly signed event", async () => {
    const raw = event("evt_test_valid", "cs_local_none");
    const res = await webhook(raw, signPayload(raw));
    expect(res.status).toBe(200);
  });

  it("rejects a missing signature", async () => {
    const res = await webhook(event("evt_test_nosig", "cs_local_none"));
    expect(res.status).toBe(400);
  });

  it("rejects a tampered payload", async () => {
    const raw = event("evt_test_tamper", "cs_local_none");
    const sig = signPayload(raw);
    const res = await webhook(raw.replace("none", "other"), sig);
    expect(res.status).toBe(400);
  });

  it("rejects a stale timestamp", async () => {
    const raw = event("evt_test_stale", "cs_local_none");
    const stale = Math.floor(Date.now() / 1000) - 400;
    const res = await webhook(raw, signPayload(raw, WEBHOOK_SECRET, stale));
    expect(res.status).toBe(400);
  });
});

describe("invoice payment via webhook", () => {
  it("pays once; replay returns already_processed and cannot move the invoice backward", async () => {
    // owner creates a checkout session on invoice 1
    const co = await fetch(`${base}/api/invoices/1/checkout`, {
      method: "POST",
      headers: { cookie: ownerCookie },
    });
    expect(co.status).toBe(200);
    const { sessionId } = (await co.json()).data;
    expect(sessionId).toBe(checkoutSessionId(1));

    // signed event pays it
    const raw = event("evt_test_pay", sessionId);
    const res = await webhook(raw, signPayload(raw));
    expect((await res.json()).data.outcome).toBe("processed");
    const inv = await db.system<{ status: string }>("SELECT status FROM portal.invoices WHERE id=1");
    expect(inv[0]!.status).toBe("paid");

    // replay: already processed, invoice stays paid
    const res2 = await webhook(raw, signPayload(raw));
    expect((await res2.json()).data.outcome).toBe("already_processed");
    const inv2 = await db.system<{ status: string }>("SELECT status FROM portal.invoices WHERE id=1");
    expect(inv2[0]!.status).toBe("paid");

    // a *different* event for the same session cannot reopen it
    const raw3 = event("evt_test_pay2", sessionId);
    await webhook(raw3, signPayload(raw3));
    const inv3 = await db.system<{ status: string }>("SELECT status FROM portal.invoices WHERE id=1");
    expect(inv3[0]!.status).toBe("paid");
  });
});

describe("auth + session", () => {
  it("rejects bad credentials, accepts seeded owner", async () => {
    const bad = await fetch(`${base}/api/login`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: "owner@acme.example", password: "wrong" }),
    });
    expect(bad.status).toBe(401);
    const good = await fetch(`${base}/api/login`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: "owner@acme.example", password: "owner-pass" }),
    });
    expect(good.status).toBe(200);
    expect(good.headers.get("set-cookie")).toContain("portal_session=");
  });

  it("a user with no membership gets 403 on login", async () => {
    const res = await fetch(`${base}/api/login`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: "stranger@example.org", password: "stranger-pass" }),
    });
    expect(res.status).toBe(403);
  });

  it("unauthenticated API calls get 401", async () => {
    const res = await fetch(`${base}/api/projects`);
    expect(res.status).toBe(401);
  });
});

describe("API journey", () => {
  it("denied cross-tenant read is 404 and lands in the audit log", async () => {
    const res = await fetch(`${base}/api/projects/3`, { headers: { cookie: ownerCookie } });
    expect(res.status).toBe(404);
    const audit = await fetch(`${base}/api/audit`, { headers: { cookie: ownerCookie } });
    const { events } = (await audit.json()).data;
    expect(events.some((e: { result: string; target: string }) => e.result === "deny" && e.target === "project:3")).toBe(true);
  });
});
