import { redirect } from "next/navigation";

import { getCurrentUser } from "@/lib/session";

/** The console has no marketing page — route straight to wherever you belong. */
export default async function RootPage() {
  const user = await getCurrentUser();
  redirect(user?.status === "active" ? "/dashboard" : "/login");
}
