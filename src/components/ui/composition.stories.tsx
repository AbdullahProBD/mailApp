import { useState } from "react";

import type { Meta, StoryObj } from "@storybook/react-vite";

import { Icon } from "@/components/icons/icon";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { NotesEditor } from "@/components/ui/notes-editor";
import { Resizable } from "@/components/ui/resizable";
import { SwipeableRow } from "@/components/ui/swipeable-row";

const meta = {
  title: "Primitives/Composition",
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

const NOTES =
  '<h3>Today</h3><ul data-type="taskList"><li data-type="taskItem" data-checked="true">Review inbox</li><li data-type="taskItem" data-checked="false">Reply to Ada</li></ul><p>Ship the draft before 17:00.</p>';

function NotesExample() {
  const [content, setContent] = useState(NOTES);
  return (
    <div style={{ maxWidth: "34rem" }}>
      <NotesEditor content={content} onChange={setContent} ariaLabel="Message notes" />
    </div>
  );
}

export const Notes: Story = {
  render: () => <NotesExample />,
};

export const SwipeActions: Story = {
  render: () => (
    <div style={{ maxWidth: "30rem" }}>
      <SwipeableRow
        leftActions={
          <button
            type="button"
            aria-label="Star message"
            style={{
              width: "5rem",
              background: "var(--warning)",
              color: "var(--warning-foreground)",
              border: "none",
            }}
          >
            <Icon name="star" size={18} />
          </button>
        }
        rightActions={
          <button
            type="button"
            aria-label="Delete message"
            style={{
              width: "5rem",
              background: "var(--danger)",
              color: "var(--danger-foreground)",
              border: "none",
            }}
          >
            <Icon name="trash" size={18} />
          </button>
        }
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "0.75rem",
            border: "1px solid var(--border)",
            background: "var(--surface)",
            padding: "0.875rem 1rem",
          }}
        >
          <Avatar name="Ada Lovelace" size="sm" />
          <div style={{ minWidth: 0, flex: 1 }}>
            <p style={{ margin: 0, fontSize: "0.875rem", fontWeight: 600 }}>Ada Lovelace</p>
            <p style={{ margin: 0, fontSize: "0.75rem", color: "var(--muted-foreground)" }}>
              Notes on the analytical engine
            </p>
          </div>
          <Badge size="sm" tone="accent">
            New
          </Badge>
        </div>
      </SwipeableRow>
    </div>
  ),
};

export const SplitPanes: Story = {
  render: () => (
    <div style={{ maxWidth: "36rem" }}>
      <Resizable
        className="h-40 rounded-xl border border-border"
        handleLabel="Resize panes"
        first={
          <div
            style={{
              display: "flex",
              height: "100%",
              alignItems: "center",
              justifyContent: "center",
              background: "var(--surface-2)",
              fontSize: "0.875rem",
              color: "var(--muted-foreground)",
            }}
          >
            Folder list
          </div>
        }
        second={
          <div
            style={{
              display: "flex",
              height: "100%",
              alignItems: "center",
              justifyContent: "center",
              background: "var(--surface)",
              fontSize: "0.875rem",
              color: "var(--muted-foreground)",
            }}
          >
            Message list
          </div>
        }
      />
    </div>
  ),
};
