import { redirect } from "next/navigation";

type OneLotProjectPageProps = {
  params: Promise<{ id: string }>;
};

/** Bare project URL always lands on its Dashboard — the four child pages do the real access check. */
export default async function OneLotProjectPage({ params }: OneLotProjectPageProps) {
  const { id } = await params;
  redirect(`/one-lot-projects/${id}/dashboard`);
}
