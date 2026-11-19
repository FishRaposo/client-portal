import { CheckoutView } from "./view";

export function generateStaticParams() {
  return [{ session: "cs_local_demo9" }, { session: "cs_local_demo1" }];
}

export default async function CheckoutPage({ params }: { params: Promise<{ session: string }> }) {
  const { session } = await params;
  return <CheckoutView session={session} />;
}
