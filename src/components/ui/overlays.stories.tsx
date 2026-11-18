import { useEffect, useRef } from "react";

import type { Meta, StoryObj } from "@storybook/react-vite";

import { Icon } from "@/components/icons/icon";
import { Button } from "@/components/ui/button";
import { CommandPalette } from "@/components/ui/command";
import { Dialog } from "@/components/ui/dialog";
import { Drawer } from "@/components/ui/drawer";
import { Input } from "@/components/ui/input";
import { Popover } from "@/components/ui/popover";
import { ToastProvider, useToast } from "@/components/ui/toast";
import { Tooltip } from "@/components/ui/tooltip";

const meta = {
  title: "Primitives/Overlays",
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

const triggerClass =
  "inline-flex h-[var(--control-h-md)] items-center justify-center gap-2 rounded-md border border-border bg-surface px-[var(--control-px)] text-sm font-medium text-foreground shadow-xs transition-colors hover:bg-surface-2";

export const DialogModal: Story = {
  render: () => (
    <Dialog
      open
      onOpenChange={() => undefined}
      title="Delete this account?"
      description="Cached messages, folders and scheduled mail for this account will be removed."
      footer={
        <>
          <Button variant="ghost">Cancel</Button>
          <Button variant="danger">Delete account</Button>
        </>
      }
    >
      <p style={{ fontSize: "0.875rem", lineHeight: 1.6, color: "var(--muted-foreground)" }}>
        This cannot be undone. Type the address to confirm in the real flow.
      </p>
    </Dialog>
  ),
};

export const DrawerPanel: Story = {
  render: () => (
    <Drawer
      open
      onOpenChange={() => undefined}
      title="Message details"
      description="Headers and delivery information"
      footer={<Button variant="secondary">Close</Button>}
    >
      <div style={{ display: "grid", gap: "0.75rem", fontSize: "0.875rem" }}>
        <p style={{ margin: 0 }}>From: Ada Lovelace &lt;ada@example.com&gt;</p>
        <p style={{ margin: 0 }}>To: owner@example.com</p>
        <p style={{ margin: 0, color: "var(--muted-foreground)" }}>
          Signed by example.com · SPF pass · DKIM pass
        </p>
      </div>
    </Drawer>
  ),
};

export const PopoverPanel: Story = {
  render: () => (
    <div style={{ paddingBottom: "12rem" }}>
      <Popover trigger="Options" triggerClassName={triggerClass} triggerLabel="Options" open>
        <div style={{ display: "grid", gap: "0.25rem", width: "14rem" }}>
          <p style={{ margin: 0, fontSize: "0.75rem", color: "var(--muted-foreground)" }}>
            Message actions
          </p>
          <Button variant="ghost" size="sm">
            Mark as unread
          </Button>
          <Button variant="ghost" size="sm">
            Add star
          </Button>
          <Button variant="ghost" size="sm">
            Move to folder
          </Button>
        </div>
      </Popover>
    </div>
  ),
};

export const TooltipLabel: Story = {
  render: () => (
    <div style={{ padding: "4rem" }}>
      <Tooltip content="Archive message">
        <Button variant="secondary" aria-label="Archive message">
          <Icon name="archive" size={18} />
        </Button>
      </Tooltip>
    </div>
  ),
};

function ToastPreview() {
  const { toast } = useToast();
  const fired = useRef(false);

  useEffect(() => {
    if (fired.current) return;
    fired.current = true;
    toast({
      title: "Message archived",
      description: "Moved to Archive. Undo within 10 seconds.",
      tone: "success",
      duration: 0,
      action: { label: "Undo", onClick: () => undefined },
    });
  }, [toast]);

  return (
    <div className="story-stack" style={{ maxWidth: "26rem" }}>
      <p style={{ margin: 0, fontSize: "0.875rem", color: "var(--muted-foreground)" }}>
        A persistent success toast with an undo action.
      </p>
    </div>
  );
}

export const Toasts: Story = {
  render: () => (
    <ToastProvider>
      <ToastPreview />
    </ToastProvider>
  ),
};

export const CommandMenu: Story = {
  render: () => (
    <CommandPalette
      open
      onOpenChange={() => undefined}
      commands={[
        {
          id: "compose",
          label: "Compose message",
          icon: "edit",
          shortcut: "C",
          onSelect: () => undefined,
        },
        {
          id: "search",
          label: "Search mail",
          icon: "search",
          shortcut: "⌘K",
          onSelect: () => undefined,
        },
        { id: "settings", label: "Open settings", icon: "settings", onSelect: () => undefined },
        { id: "logout", label: "Sign out", icon: "log-out", onSelect: () => undefined },
      ]}
    />
  ),
};

export const InputInsideOverlay: Story = {
  render: () => (
    <Dialog
      open
      onOpenChange={() => undefined}
      title="Move to folder"
      footer={
        <>
          <Button variant="ghost">Cancel</Button>
          <Button variant="primary">Move</Button>
        </>
      }
    >
      <Input placeholder="Search folders" aria-label="Search folders" />
    </Dialog>
  ),
};
