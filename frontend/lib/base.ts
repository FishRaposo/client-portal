// Normalized Pages base path for links: "/client-portal" in the demo build,
// "" in local dev. NEXT_PUBLIC_BASE_PATH arrives without a leading slash.
const raw = process.env.NEXT_PUBLIC_BASE_PATH ?? "";
export const basePath = raw === "" ? "" : `/${raw.replace(/^\/+|\/+$/g, "")}`;
