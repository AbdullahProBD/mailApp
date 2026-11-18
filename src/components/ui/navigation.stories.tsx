import type { Meta, StoryObj } from "@storybook/react-vite";

import { Accordion } from "@/components/ui/accordion";
import { Breadcrumb } from "@/components/ui/breadcrumb";
import { DropdownMenu } from "@/components/ui/dropdown-menu";
import { Pagination } from "@/components/ui/pagination";
import { Tabs } from "@/components/ui/tabs";

const meta = {
  title: "Primitives/Navigation",
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

const triggerClass =
  "inline-flex h-[var(--control-h-md)] items-center justify-center gap-2 rounded-md border border-border bg-surface px-[var(--control-px)] text-sm font-medium text-foreground shadow-xs transition-colors hover:bg-surface-2";

export const TabsUnderline: Story = {
  render: () => (
    <Tabs
      className="max-w-xl"
      items={[
        { value: "inbox", label: "Inbox", content: <p>Inbox panel</p> },
        { value: "starred", label: "Starred", content: <p>Starred panel</p> },
        { value: "sent", label: "Sent", content: <p>Sent panel</p> },
        { value: "snoozed", label: "Snoozed", content: <p>Snoozed panel</p>, disabled: true },
      ]}
    />
  ),
};

export const TabsPill: Story = {
  render: () => (
    <Tabs
      variant="pill"
      items={[
        { value: "all", label: "All", content: <p>All messages</p> },
        { value: "unread", label: "Unread", content: <p>Unread messages</p> },
        { value: "attachments", label: "Attachments", content: <p>Messages with files</p> },
      ]}
    />
  ),
};

export const AccordionPanels: Story = {
  render: () => (
    <Accordion
      className="max-w-xl"
      multiple
      defaultValue={["sync"]}
      items={[
        {
          value: "sync",
          title: "Sync interval",
          content: <p>How often each account checks for new mail.</p>,
        },
        {
          value: "notifications",
          title: "Notifications",
          content: <p>Desktop alerts and unread badges.</p>,
        },
        {
          value: "signature",
          title: "Signature",
          content: <p>The signature appended to new messages.</p>,
        },
      ]}
    />
  ),
};

export const BreadcrumbTrail: Story = {
  render: () => (
    <Breadcrumb
      items={[
        { label: "Settings", href: "/settings" },
        { label: "Accounts", href: "/settings/accounts" },
        { label: "Personal account" },
      ]}
    />
  ),
};

export const PaginationControls: Story = {
  render: () => (
    <div style={{ maxWidth: "32rem" }}>
      <Pagination page={6} pageCount={12} onPageChange={() => undefined} />
    </div>
  ),
};

export const ActionMenu: Story = {
  render: () => (
    <div className="story-row" style={{ paddingBottom: "14rem" }}>
      <DropdownMenu
        trigger="More"
        triggerClassName={triggerClass}
        triggerLabel="More actions"
        items={[
          { type: "label", label: "Message" },
          { type: "item", value: "reply", label: "Reply", icon: "arrow-left", shortcut: "R" },
          { type: "item", value: "forward", label: "Forward", icon: "arrow-right", shortcut: "F" },
          { type: "separator" },
          { type: "item", value: "archive", label: "Archive", icon: "archive" },
          { type: "item", value: "delete", label: "Delete", icon: "trash", danger: true },
        ]}
      />
    </div>
  ),
};
