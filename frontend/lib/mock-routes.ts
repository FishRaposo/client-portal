import type { MockRoute } from "@shared/api";
import { demoAudit, demoDetail, demoPersona, demoProjects } from "./demo-data";

/**
 * The demo's deterministic routes. They simulate the real API's shapes,
 * including the cross-tenant denial (the static build cannot run the embedded
 * database; the denial here is simulated — the README and DEMO_CONTRACT say
 * the local run enforces it with real policies).
 */
export const mockRoutes: MockRoute[] = [
  { method: "GET", path: "/api/me", respond: () => demoPersona() },
  {
    method: "POST",
    path: "/api/login",
    respond: () => demoPersona(),
  },
  { method: "GET", path: "/api/projects", respond: () => ({ projects: demoProjects }) },
  {
    method: "GET",
    path: "/api/projects/:id",
    respond: ({ params }) => {
      const detail = demoDetail(Number(params.id));
      if (!detail) {
        return { error: { code: "denied", message: "not found or not accessible" } };
      }
      return detail;
    },
  },
  {
    method: "POST",
    path: "/api/approvals/:id/decide",
    respond: ({ body }) => ({ status: (body as { status?: string })?.status ?? "approved" }),
  },
  {
    method: "POST",
    path: "/api/notes",
    respond: () => ({ noteId: 99 }),
  },
  {
    method: "POST",
    path: "/api/invoices/:id/checkout",
    respond: ({ params }) => ({
      sessionId: "cs_local_demo9",
      checkoutUrl: `/checkout/cs_local_demo9/`,
      invoiceId: Number(params.id),
    }),
  },
  { method: "GET", path: "/api/audit", respond: () => ({ events: demoAudit }) },
];
