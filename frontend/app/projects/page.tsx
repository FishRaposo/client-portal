"use client";
import { basePath } from "../../lib/base";

import { useEffect, useState } from "react";
import { api } from "../../lib/api";
import { Badge, Card, EmptyState, ErrorState, LoadingState } from "@shared/ui";
import type { Me, Project } from "../../lib/types";



export default function Projects() {
  const [me, setMe] = useState<Me | null>(null);
  const [projects, setProjects] = useState<Project[] | null>(null);
  const [error, setError] = useState<unknown>(null);

  useEffect(() => {
    api
      .get<Me>("/api/me")
      .then(setMe)
      .then(() => api.get<{ projects: Project[] }>("/api/projects"))
      .then((r) => setProjects(r.projects))
      .catch(setError);
  }, []);

  if (error) return <ErrorState error={error} />;
  if (!me || !projects) return <LoadingState label="Loading projects" />;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold">{me.tenant}</h1>
          <p className="text-sm text-muted">
            Signed in as {me.name} · <Badge>{me.role}</Badge>
          </p>
        </div>
      </div>
      {projects.length === 0 ? (
        <EmptyState title="No projects yet" hint="Projects appear here once created for your tenant." />
      ) : (
        <div className="grid gap-3">
          {projects.map((p) => (
            <a key={p.id} href={`${basePath}/projects/${p.id}/`}>
              <Card className="flex items-center justify-between hover:border-accent">
                <span className="font-medium">{p.name}</span>
                <Badge>{p.status}</Badge>
              </Card>
            </a>
          ))}
        </div>
      )}
      <p className="text-sm text-muted">
        Try the cross-tenant denial:{" "}
        <a className="text-accent underline" href={`${basePath}/projects/3/`}>
          open project 3
        </a>{" "}
        — it belongs to another tenant and the policy denies the read.
      </p>
    </div>
  );
}
