import {
  MessageListSkeleton,
  MessageReaderSkeleton,
  SidebarSkeleton,
} from "@/components/skeletons";

export default function InboxLoading() {
  return (
    <div className="grid h-full grid-cols-[16rem_1fr] overflow-hidden md:grid-cols-[16rem_22rem_1fr]">
      <aside className="hidden border-r border-border bg-surface-2 md:block">
        <SidebarSkeleton />
      </aside>
      <section className="border-r border-border bg-surface">
        <MessageListSkeleton rows={10} />
      </section>
      <section className="hidden bg-surface md:block">
        <MessageReaderSkeleton />
      </section>
    </div>
  );
}
