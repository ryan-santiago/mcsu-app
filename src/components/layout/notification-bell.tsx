"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Bell } from "lucide-react";
import Link from "next/link";
import * as React from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";
import { formatRelative } from "@/lib/format";
import { fetchNotifications, markAllNotificationsRead } from "@/server/notifications/actions";
import { notificationsQueryKey } from "@/server/notifications/query-key";

/**
 * Scoped to whatever `listNotifications()` currently produces — User
 * Management's pending-approval queue only, for now (see AGENTS.md). Adding
 * another module's notifications later needs no change here, just another
 * source function on the server side.
 */
export function NotificationBell() {
  const [open, setOpen] = React.useState(false);
  const queryClient = useQueryClient();

  const { data } = useQuery({
    queryKey: notificationsQueryKey,
    queryFn: fetchNotifications,
    refetchInterval: 60_000,
  });

  const items = data ?? [];
  const unreadCount = items.filter((item) => !item.read).length;

  const markAllRead = useMutation({
    mutationFn: markAllNotificationsRead,
    onSuccess: (result) => {
      if (result.ok) void queryClient.invalidateQueries({ queryKey: notificationsQueryKey });
    },
  });

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        // Opening the panel is what counts as "seen": the badge clears, but
        // every item stays listed — it only drops off once its underlying
        // request is actually resolved (approved/rejected), not because it
        // was viewed.
        if (next && unreadCount > 0) markAllRead.mutate();
      }}
    >
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="relative"
          aria-label={unreadCount > 0 ? `Notifications (${unreadCount} unread)` : "Notifications"}
        >
          <Bell className="size-5" aria-hidden />
          {unreadCount > 0 ? (
            <Badge className="bg-destructive text-destructive-foreground absolute -top-1 -right-1 h-4 min-w-4 justify-center rounded-full px-1 text-[0.625rem] leading-none">
              {unreadCount > 9 ? "9+" : unreadCount}
            </Badge>
          ) : null}
        </Button>
      </PopoverTrigger>

      <PopoverContent align="end" className="w-80 gap-0 p-0">
        <div className="flex items-center justify-between border-b px-3 py-2.5">
          <p className="text-sm font-semibold">Notifications</p>
          {items.length > 0 ? <span className="text-muted-foreground text-xs">{items.length}</span> : null}
        </div>

        {items.length === 0 ? (
          <p className="text-muted-foreground px-3 py-6 text-center text-sm">You&apos;re all caught up.</p>
        ) : (
          <ScrollArea className="max-h-80">
            <ul className="divide-y">
              {items.map((item) => (
                <li key={item.key}>
                  <Link
                    href={item.href}
                    onClick={() => setOpen(false)}
                    className="hover:bg-accent flex flex-col gap-0.5 px-3 py-2.5 text-sm transition-colors"
                  >
                    <span className="flex items-center gap-2 font-medium">
                      {!item.read ? (
                        <span className="bg-brand-accent size-1.5 shrink-0 rounded-full" aria-hidden />
                      ) : null}
                      {item.title}
                    </span>
                    <span className="text-muted-foreground line-clamp-2 text-xs">{item.description}</span>
                    <span className="text-muted-foreground/80 text-[0.6875rem]">
                      {formatRelative(item.createdAt)}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </ScrollArea>
        )}
      </PopoverContent>
    </Popover>
  );
}
