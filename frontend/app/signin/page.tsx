"use client";
import { basePath } from "../../lib/base";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { api, isDemo } from "../../lib/api";
import { personas, setDemoPersona } from "../../lib/demo-data";
import { Button, Card, CardTitle, ErrorState } from "@shared/ui";
import type { Me } from "../../lib/types";



export default function SignIn() {
  const router = useRouter();
  const [email, setEmail] = useState("owner@acme.example");
  const [password, setPassword] = useState("owner-pass");
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const me = await api.post<Me>("/api/login", { email, password });
      if (me && typeof window !== "undefined") {
        window.localStorage.setItem("portal-me", JSON.stringify(me));
      }
      router.push("/projects/");
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  }

  if (isDemo) {
    return (
      <>
        <h1 className="mb-4 text-xl font-bold">Sign in</h1>
        <Card>
        <CardTitle>Choose a demo persona</CardTitle>
        <p className="mt-1 text-sm text-muted">
          The static demo signs you in as a synthetic Acme Bakery user. The
          local run uses the seeded credentials shown below.
        </p>
        <div className="mt-4 space-y-2">
          {personas.map((p, i) => (
            <button
              key={p.userId}
              type="button"
              className="flex w-full items-center justify-between rounded-card border border-border px-4 py-3 text-left hover:border-accent"
              onClick={() => {
                setDemoPersona(i);
                window.localStorage.setItem("portal-me", JSON.stringify(p));
                router.push("/projects/");
              }}
            >
              <span>
                <span className="block font-medium">{p.name}</span>
                <span className="text-sm text-muted">{p.tenant}</span>
              </span>
              <span className="rounded-full border border-border px-2 py-0.5 text-xs text-muted">
                {p.role}
              </span>
            </button>
          ))}
        </div>
      </Card>
      </>
    );
  }

  return (
    <>
      <h1 className="mb-4 text-xl font-bold">Sign in</h1>
      <Card>
      <CardTitle>Sign in</CardTitle>
      <p className="mt-1 text-sm text-muted">
        Seeded local users, e.g. <code>owner@acme.example / owner-pass</code>,{" "}
        <code>viewer@acme.example / viewer-pass</code>, or{" "}
        <code>stranger@example.org / stranger-pass</code> (no membership).
      </p>
      <form onSubmit={submit} className="mt-4 space-y-3">
        <label className="block text-sm">
          Email
          <input
            className="mt-1 w-full rounded-card border border-border bg-bg px-3 py-2"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            type="email"
            required
          />
        </label>
        <label className="block text-sm">
          Password
          <input
            className="mt-1 w-full rounded-card border border-border bg-bg px-3 py-2"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            type="password"
            required
          />
        </label>
        {error ? <ErrorState error={error} /> : null}
        <Button type="submit" disabled={busy}>
          {busy ? "Signing in…" : "Sign in"}
        </Button>
      </form>
      </Card>
    </>
  );
}
