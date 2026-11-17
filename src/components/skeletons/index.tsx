import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils/cn";

/** Sidebar: brand, nav items, folders. */
export function SidebarSkeleton({ className }: { className?: string }) {
  return (
    <div className={cn("flex h-full flex-col gap-4 p-3", className)} aria-hidden="true">
      <Skeleton className="h-8 w-32" />
      <Skeleton className="h-10 w-full" />
      <div className="flex flex-col gap-2">
        {Array.from({ length: 6 }, (_, index) => (
          <Skeleton key={index} className="h-8 w-full" />
        ))}
      </div>
      <div className="mt-4 flex flex-col gap-2">
        {Array.from({ length: 4 }, (_, index) => (
          <Skeleton key={index} className="h-7 w-full" />
        ))}
      </div>
    </div>
  );
}

/** A single message-list row: avatar, two text lines, meta. */
export function MessageRowSkeleton({ className }: { className?: string }) {
  return (
    <div
      className={cn("flex items-start gap-3 border-b border-border px-4 py-3", className)}
      aria-hidden="true"
    >
      <Skeleton className="size-8 rounded-full" />
      <div className="min-w-0 flex-1 space-y-2">
        <div className="flex items-center justify-between gap-3">
          <Skeleton className="h-3.5 w-32" />
          <Skeleton className="h-3 w-12" />
        </div>
        <Skeleton className="h-3.5 w-48" />
        <Skeleton className="h-3 w-full" />
      </div>
    </div>
  );
}

export function MessageListSkeleton({ rows = 8 }: { rows?: number }) {
  return (
    <div role="status" aria-busy="true" aria-label="Loading messages">
      {Array.from({ length: rows }, (_, index) => (
        <MessageRowSkeleton key={index} />
      ))}
    </div>
  );
}

/** Message reader: subject, sender, body lines, attachment. */
export function MessageReaderSkeleton() {
  return (
    <div
      role="status"
      aria-busy="true"
      aria-label="Loading message"
      className="flex flex-col gap-5 p-6"
    >
      <div className="space-y-3">
        <Skeleton className="h-6 w-3/4" />
        <div className="flex items-center gap-3">
          <Skeleton className="size-9 rounded-full" />
          <div className="space-y-2">
            <Skeleton className="h-3.5 w-40" />
            <Skeleton className="h-3 w-56" />
          </div>
        </div>
      </div>
      <div className="space-y-2">
        {Array.from({ length: 10 }, (_, index) => (
          <Skeleton key={index} className={cn("h-3.5", index % 5 === 4 ? "w-2/3" : "w-full")} />
        ))}
      </div>
      <Skeleton className="h-16 w-48 rounded-lg" />
    </div>
  );
}

/** Conversation/thread view: collapsed older messages. */
export function ThreadSkeleton() {
  return (
    <div
      role="status"
      aria-busy="true"
      aria-label="Loading thread"
      className="flex flex-col gap-4 p-6"
    >
      {Array.from({ length: 3 }, (_, index) => (
        <div key={index} className="space-y-3 rounded-xl border border-border p-4">
          <div className="flex items-center gap-3">
            <Skeleton className="size-8 rounded-full" />
            <Skeleton className="h-3.5 w-40" />
          </div>
          <div className="space-y-2">
            <Skeleton className="h-3 w-full" />
            <Skeleton className="h-3 w-5/6" />
            <Skeleton className="h-3 w-2/3" />
          </div>
        </div>
      ))}
    </div>
  );
}

/** Composer: to/subject/body/toolbar. */
export function ComposerSkeleton() {
  return (
    <div
      role="status"
      aria-busy="true"
      aria-label="Loading composer"
      className="flex flex-col gap-4 rounded-xl border border-border bg-surface p-5"
    >
      <Skeleton className="h-10 w-full rounded-md" />
      <Skeleton className="h-10 w-2/3 rounded-md" />
      <Skeleton className="h-56 w-full rounded-md" />
      <div className="flex items-center justify-between">
        <Skeleton className="h-8 w-40 rounded-md" />
        <Skeleton className="h-8 w-24 rounded-md" />
      </div>
    </div>
  );
}

/** Settings page: section blocks with rows. */
export function SettingsSkeleton() {
  return (
    <div
      role="status"
      aria-busy="true"
      aria-label="Loading settings"
      className="flex flex-col gap-6"
    >
      {Array.from({ length: 3 }, (_, section) => (
        <div key={section} className="rounded-xl border border-border bg-surface p-5">
          <Skeleton className="h-4 w-40" />
          <div className="mt-4 flex flex-col gap-4">
            {Array.from({ length: 3 }, (_, row) => (
              <div key={row} className="flex items-center justify-between gap-4">
                <div className="space-y-2">
                  <Skeleton className="h-3.5 w-48" />
                  <Skeleton className="h-3 w-64" />
                </div>
                <Skeleton className="h-8 w-24 rounded-md" />
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

/** Calendar: header, weekday row, month grid. */
export function CalendarSkeleton() {
  return (
    <div
      role="status"
      aria-busy="true"
      aria-label="Loading calendar"
      className="rounded-xl border border-border bg-surface p-5"
    >
      <div className="flex items-center justify-between">
        <Skeleton className="h-5 w-32" />
        <div className="flex gap-2">
          <Skeleton className="size-8 rounded-md" />
          <Skeleton className="size-8 rounded-md" />
        </div>
      </div>
      <div className="mt-4 grid grid-cols-7 gap-1">
        {Array.from({ length: 7 }, (_, index) => (
          <Skeleton key={`w-${String(index)}`} className="h-3 w-full" />
        ))}
        {Array.from({ length: 35 }, (_, index) => (
          <Skeleton key={`d-${String(index)}`} className="h-14 w-full rounded-md" />
        ))}
      </div>
    </div>
  );
}

/** Contacts list: search field and rows. */
export function ContactsSkeleton() {
  return (
    <div
      role="status"
      aria-busy="true"
      aria-label="Loading contacts"
      className="flex flex-col gap-4"
    >
      <Skeleton className="h-10 w-full rounded-md" />
      {Array.from({ length: 8 }, (_, index) => (
        <div key={index} className="flex items-center gap-3">
          <Skeleton className="size-9 rounded-full" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-3.5 w-40" />
            <Skeleton className="h-3 w-56" />
          </div>
        </div>
      ))}
    </div>
  );
}

/** Notes list: title and checklists. */
export function NotesSkeleton() {
  return (
    <div role="status" aria-busy="true" aria-label="Loading notes" className="flex flex-col gap-4">
      <Skeleton className="h-8 w-48" />
      {Array.from({ length: 3 }, (_, note) => (
        <div key={note} className="rounded-xl border border-border bg-surface p-4">
          <Skeleton className="h-3.5 w-40" />
          <div className="mt-3 space-y-2">
            {Array.from({ length: 3 }, (_, line) => (
              <div key={line} className="flex items-center gap-2">
                <Skeleton className="size-4 rounded-[0.3125rem]" />
                <Skeleton className="h-3 w-full" />
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

/** Centered card used by the auth screens while their server data resolves. */
export function CenteredCardSkeleton() {
  return (
    <main className="flex min-h-full items-center justify-center px-5 py-12 sm:px-8">
      <div
        role="status"
        aria-busy="true"
        aria-label="Loading"
        className="w-full max-w-md rounded-2xl border border-border bg-surface p-8 shadow-lg"
      >
        <Skeleton className="size-12 rounded-xl" />
        <Skeleton className="mt-7 h-3 w-24" />
        <Skeleton className="mt-3 h-8 w-56" />
        <Skeleton className="mt-3 h-3.5 w-full" />
        <div className="mt-8 space-y-4">
          <Skeleton className="h-11 w-full rounded-md" />
          <Skeleton className="h-11 w-full rounded-md" />
          <Skeleton className="h-11 w-full rounded-md" />
        </div>
      </div>
    </main>
  );
}
