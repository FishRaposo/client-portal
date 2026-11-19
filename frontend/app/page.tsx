import { Card, CardTitle } from "@shared/ui";
import { basePath } from "../lib/base";



export default function Home() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">A client workspace with real tenant isolation</h1>
        <p className="mt-2 max-w-2xl text-muted">
          Clients see only their own projects, approve bounded scopes, receive
          delivery notes and pay invoices. Isolation is enforced by Postgres
          row-level policies in an embedded database — not by checks scattered
          through the app.
        </p>
      </div>
      <div className="grid gap-4 sm:grid-cols-3">
        <Card>
          <CardTitle>Row-level security</CardTitle>
          <p className="mt-2 text-sm text-muted">
            Every tenant table carries CREATE POLICY statements; roles are read
            from memberships, never asserted by the caller.
          </p>
        </Card>
        <Card>
          <CardTitle>Signed webhooks</CardTitle>
          <p className="mt-2 text-sm text-muted">
            Stripe&apos;s published HMAC scheme, one verifier, idempotent events
            and a guarded open→paid transition.
          </p>
        </Card>
        <Card>
          <CardTitle>Audit trail</CardTitle>
          <p className="mt-2 text-sm text-muted">
            Every allow and deny — including a visibly denied cross-tenant
            read — lands in an append-only audit log.
          </p>
        </Card>
      </div>
      <a
        href={`${basePath}/signin/`}
        className="inline-block min-h-[44px] rounded-card bg-accent px-6 py-2.5 font-medium text-accent-fg hover:brightness-110"
      >
        Sign in
      </a>
    </div>
  );
}
