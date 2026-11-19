import { ProjectView } from "./view";

export function generateStaticParams() {
  // The static demo pre-renders the two sample projects and the cross-tenant
  // denial target (3) so the deep link boots offline.
  return [{ id: "1" }, { id: "2" }, { id: "3" }];
}

export default async function ProjectPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <ProjectView id={id} />;
}
