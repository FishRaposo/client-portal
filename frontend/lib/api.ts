import { createClient, HttpAdapter, MockAdapter } from "@shared/api";
import { mockRoutes } from "./mock-routes";

/**
 * The one adapter switch. NEXT_PUBLIC_DEMO_MODE is inlined at build time:
 * "true" for the static demo (mock adapter, zero network), anything else for
 * the local run (HTTP adapter against the Node service on :4100).
 */
const demo = process.env.NEXT_PUBLIC_DEMO_MODE === "true";
const base = process.env.NEXT_PUBLIC_API_BASE ?? "http://localhost:4100";

export const api = createClient(
  demo ? new MockAdapter(mockRoutes, { latencyMs: 40 }) : new HttpAdapter(base),
);
export const isDemo = demo;
