import { CalendarDays } from "lucide-react";
import type { Metadata } from "next";

import { OneLotProjectPageShell } from "@/components/one-lot-projects/one-lot-project-page";

export const metadata: Metadata = { title: "Calendar" };

type OneLotProjectCalendarPageProps = {
  params: Promise<{ id: string }>;
};

export default async function OneLotProjectCalendarPage({ params }: OneLotProjectCalendarPageProps) {
  const { id } = await params;

  return (
    <OneLotProjectPageShell
      projectId={id}
      pageTitle="Calendar"
      icon={CalendarDays}
      description="The activity calendar isn't built yet."
    />
  );
}
