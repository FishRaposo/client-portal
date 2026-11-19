import "./globals.css";
import type { Metadata } from "next";
import type { ReactNode } from "react";
import { SampleDataBadge } from "@shared/ui";
import { basePath } from "../lib/base";

export const metadata: Metadata = {
  title: "Client Portal",
  description: "Multi-tenant client portal with Postgres row-level security and signed Stripe webhooks",
};

const demo = process.env.NEXT_PUBLIC_DEMO_MODE === "true";


export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-bg font-sans text-text antialiased">
        <header className="border-b border-border bg-surface">
          <div className="mx-auto flex max-w-4xl items-center justify-between px-4 py-3">
            <a href={`${basePath}/`} className="font-semibold">
              Client Portal
            </a>
            <nav className="flex items-center gap-4 text-sm text-muted">
              <a className="hover:text-text" href={`${basePath}/projects/`}>Projects</a>
              <a className="hover:text-text" href={`${basePath}/audit/`}>Audit</a>
              {demo ? <SampleDataBadge /> : null}
            </nav>
          </div>
        </header>
        <main className="mx-auto max-w-4xl px-4 py-8">{children}</main>
      </body>
    </html>
  );
}
