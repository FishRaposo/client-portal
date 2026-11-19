// Stripe webhook signing per the published scheme:
//   Stripe-Signature: t=<unix>,v1=<hex>
//   v1 = HMAC-SHA256(secret, "<t>.<raw payload>")
// The local signer and a real test-mode endpoint share this one verifier.
// No live keys ever live in this repo; the secret is a local constant.

import { createHmac, timingSafeEqual } from "node:crypto";

export const WEBHOOK_SECRET =
  process.env.PORTAL_WEBHOOK_SECRET ?? "whsec_local_dev_only";
const TOLERANCE_S = 300;

export function signPayload(payload: string, secret = WEBHOOK_SECRET, t?: number): string {
  const ts = t ?? Math.floor(Date.now() / 1000);
  const v1 = createHmac("sha256", secret).update(`${ts}.${payload}`).digest("hex");
  return `t=${ts},v1=${v1}`;
}

export function verifySignature(
  payload: string,
  header: string | undefined,
  secret = WEBHOOK_SECRET,
  now = Math.floor(Date.now() / 1000),
): { ok: true } | { ok: false; reason: string } {
  if (!header) return { ok: false, reason: "missing signature header" };
  const parts = Object.fromEntries(
    header.split(",").map((kv) => kv.split("=", 2) as [string, string]),
  );
  const t = Number(parts.t);
  const v1 = parts.v1;
  if (!Number.isFinite(t) || !v1) return { ok: false, reason: "malformed signature" };
  if (Math.abs(now - t) > TOLERANCE_S) return { ok: false, reason: "stale timestamp" };
  const expected = createHmac("sha256", secret).update(`${t}.${payload}`).digest();
  const got = Buffer.from(v1, "hex");
  if (expected.length !== got.length || !timingSafeEqual(expected, got)) {
    return { ok: false, reason: "signature mismatch" };
  }
  return { ok: true };
}

// Deterministic local checkout session id (mirrors cs_test_ shape, marked local).
export function checkoutSessionId(invoiceId: number): string {
  const tag = createHmac("sha256", WEBHOOK_SECRET)
    .update(`checkout:${invoiceId}`)
    .digest("hex")
    .slice(0, 24);
  return `cs_local_${tag}`;
}
