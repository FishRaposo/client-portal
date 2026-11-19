"use client";

import { useEffect, useState } from "react";
import { api } from "../../lib/api";
import { Badge, Card, CardTitle, EmptyState, ErrorState, LoadingState, Table } from "@shared/ui";
import type { AuditEvent, Me } from "../../lib/types";

export default function Audit() {
  const [me, setMe] = useState<Me | null>(null);
  const [events, setEvents] = useState<AuditEvent[] | null>(null);
  const [error, setError] = useState<unknown>(null);

  useEffect(() => {
    api
      .get<Me>("/api/me")
      .then(setMe)
      .then(() => api.get<{ events: AuditEvent[] }>("/api/audit"))
      .then((r) => setEvents(r.events))
      .catch(setError);
  }, []);

  if (error) return <ErrorState error={error} />;
  if (!me || !events) return <LoadingState label="Loading audit log" />;

  return (
    <>
      <h1 className="mb-4 text-xl font-bold">Audit log</h1>
    <Card>
      <CardTitle>Audit log</CardTitle>
      <p className="mt-1 text-sm text-muted">
        Append-only record of allow/deny, approval and billing events for{" "}
        {me.tenant}. Only owners read it — that rule is itself a policy.
      </p>
      <Table
        caption="Tenant audit events"
        headers={["When", "Actor", "Action", "Target", "Result"]}
        rows={events.map((e) => [
          <span key="w" className="whitespace-nowrap text-muted">
            {new Date(e.created_at).toLocaleString()}
          </span>,
          e.actor ?? "system",
          e.action,
          <span key="t" className="text-muted">{e.target}</span>,
          <Badge key="r" tone={e.result === "deny" ? "danger" : "success"}>{e.result}</Badge>,
        ])}
      />
    </Card>
    </>
  );
}
