"use client";
import { basePath } from "../../../lib/base";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "../../../lib/api";
import { Badge, Button, Card, CardTitle, EmptyState, ErrorState, LoadingState } from "@shared/ui";
import type { Me, ProjectDetail } from "../../../lib/types";



export function ProjectView({ id }: { id: string }) {
  const router = useRouter();
  const [me, setMe] = useState<Me | null>(null);
  const [detail, setDetail] = useState<ProjectDetail | null>(null);
  const [denied, setDenied] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState("");
  const [paidMsg, setPaidMsg] = useState("");

  const load = useCallback(() => {
    api
      .get<Me>("/api/me")
      .then(setMe)
      .then(() => api.get<ProjectDetail>(`/api/projects/${id}`))
      .then((d) => {
        setDenied(false);
        setError(null);
        setDetail(d);
      })
      .catch((e) => {
        if (e && typeof e === "object" && "code" in e && (e as { code: string }).code === "denied") {
          setDenied(true);
        } else {
          setError(e);
        }
      });
  }, [id]);

  useEffect(load, [load]);

  async function decide(approvalId: number, status: "approved" | "denied") {
    setBusy(true);
    try {
      await api.post(`/api/approvals/${approvalId}/decide`, { status });
      load();
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
    }
  }

  async function addNote(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      await api.post("/api/notes", { project_id: Number(id), body: note });
      setNote("");
      load();
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  }

  async function pay(invoiceId: number) {
    setBusy(true);
    setPaidMsg("");
    try {
      const r = await api.post<{ checkoutUrl: string }>(`/api/invoices/${invoiceId}/checkout`, {});
      router.push(r.checkoutUrl);
    } catch (e) {
      setError(e);
      setBusy(false);
    }
  }

  if (denied) {
    return (
      <Card className="border-danger/40">
        <CardTitle>Access denied</CardTitle>
        <p className="mt-2 text-sm text-muted">
          Project {id} does not exist in your tenant — or the database policy
          refused the read. In the local run the denial comes from Postgres
          row-level security and is written to the audit log; in this static
          demo the response is simulated.
        </p>
        <a className="mt-4 inline-block text-accent underline" href={`${basePath}/projects/`}>
          Back to your projects
        </a>
      </Card>
    );
  }
  if (error) return <ErrorState error={error} retry={load} />;
  if (!me || !detail) return <LoadingState label="Loading project" />;

  const canWrite = me.role === "owner" || me.role === "member";
  const isOwner = me.role === "owner";

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <a href={`${basePath}/projects/`} className="text-sm text-muted hover:text-text">← Projects</a>
          <h1 className="mt-1 text-xl font-bold">{detail.project.name}</h1>
        </div>
        <Badge>{detail.project.status}</Badge>
      </div>

      <Card>
        <CardTitle>Scopes and approvals</CardTitle>
        {detail.scopes.length === 0 ? (
          <EmptyState title="No scopes" hint="Scopes with acceptance criteria appear here." />
        ) : (
          detail.scopes.map((s) => {
            const pending = detail.approvals.find((a) => a.scope_id === s.id && a.status === "pending");
            return (
              <div key={s.id} className="mt-3 rounded-card border border-border p-4">
                <div className="flex items-center justify-between">
                  <span className="font-medium">{s.title}</span>
                  <Badge>{s.status}</Badge>
                </div>
                <p className="mt-1 text-sm text-muted">{s.acceptance_criteria}</p>
                {pending ? (
                  <div className="mt-3 flex items-center gap-2">
                    <span className="text-sm text-muted">
                      Approval requested by {pending.requested_by}
                    </span>
                    {isOwner ? (
                      <>
                        <Button disabled={busy} onClick={() => decide(pending.id, "approved")}>Approve</Button>
                        <Button disabled={busy} onClick={() => decide(pending.id, "denied")}>Deny</Button>
                      </>
                    ) : (
                      <span className="text-xs text-muted">owner decides</span>
                    )}
                  </div>
                ) : null}
              </div>
            );
          })
        )}
      </Card>

      <Card>
        <CardTitle>Delivery notes</CardTitle>
        {detail.notes.length === 0 ? (
          <EmptyState title="No notes yet" />
        ) : (
          <ul className="mt-2 space-y-2">
            {detail.notes.map((n) => (
              <li key={n.id} className="text-sm">
                <span className="text-muted">{new Date(n.delivered_at).toLocaleDateString()}</span> — {n.body}
              </li>
            ))}
          </ul>
        )}
        {canWrite ? (
          <form onSubmit={addNote} className="mt-3 flex gap-2">
            <input
              className="flex-1 rounded-card border border-border bg-bg px-3 py-2 text-sm"
              placeholder="Add a delivery note"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              required
            />
            <Button type="submit" disabled={busy}>Post</Button>
          </form>
        ) : (
          <p className="mt-2 text-xs text-muted">viewers cannot post notes</p>
        )}
      </Card>

      <Card>
        <CardTitle>Invoices</CardTitle>
        {detail.invoices.length === 0 ? (
          <EmptyState title="No invoices" />
        ) : (
          <div className="mt-2 space-y-2">
            {detail.invoices.map((inv) => (
              <div key={inv.id} className="flex items-center justify-between rounded-card border border-border px-4 py-3">
                <span>
                  <span className="font-medium">${(inv.amount_cents / 100).toFixed(2)}</span>
                  <span className="ml-2 text-sm text-muted">invoice #{inv.id}</span>
                </span>
                <span className="flex items-center gap-3">
                  <Badge>{inv.status}</Badge>
                  {inv.status === "open" && isOwner ? (
                    <Button disabled={busy} onClick={() => pay(inv.id)}>Pay</Button>
                  ) : null}
                </span>
              </div>
            ))}
          </div>
        )}
        {paidMsg ? <p className="mt-2 text-sm text-ok">{paidMsg}</p> : null}
        {isOwner ? null : <p className="mt-2 text-xs text-muted">only the owner pays invoices</p>}
      </Card>
    </div>
  );
}
