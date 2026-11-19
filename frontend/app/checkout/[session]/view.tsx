"use client";
import { basePath } from "../../../lib/base";

import { useState } from "react";
import { api, isDemo } from "../../../lib/api";
import { Button, Card, CardTitle, ErrorState } from "@shared/ui";



export function CheckoutView({ session }: { session: string }) {
  const [state, setState] = useState<"idle" | "paying" | "done">("idle");
  const [outcome, setOutcome] = useState("");
  const [error, setError] = useState<unknown>(null);

  async function complete() {
    setState("paying");
    setError(null);
    try {
      const r = await api.post<{ outcome: string }>(`/api/checkout/${session}/complete`, {});
      setOutcome(r.outcome);
      setState("done");
    } catch (e) {
      setError(e);
      setState("idle");
    }
  }

  return (
    <Card>
      <CardTitle>Local checkout</CardTitle>
      <p className="mt-2 text-sm text-muted">
        This page stands in for Stripe Checkout. It never touches a card or the
        network beyond this app: confirming posts a locally-signed{" "}
        <code>checkout.session.completed</code> event through the same signature
        verifier a live Stripe delivery would hit. Session{" "}
        <code>{session}</code>.
      </p>
      {state === "done" ? (
        <p className="mt-4 text-sm">
          Webhook outcome: <strong>{outcome}</strong>. Replaying the same event
          returns <code>already_processed</code> and cannot move the invoice
          backward.{" "}
          <a className="text-accent underline" href={`${basePath}/projects/`}>
            Back to projects
          </a>
        </p>
      ) : (
        <>
          {error ? <ErrorState error={error} /> : null}
          <Button className="mt-4" disabled={state === "paying"} onClick={complete}>
            {state === "paying" ? "Confirming…" : isDemo ? "Simulate payment" : "Confirm payment"}
          </Button>
        </>
      )}
    </Card>
  );
}
