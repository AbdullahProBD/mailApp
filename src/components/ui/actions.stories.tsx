import type { Meta, StoryObj } from "@storybook/react-vite";

import { Icon } from "@/components/icons/icon";
import { Button } from "@/components/ui/button";
import { IconButton } from "@/components/ui/icon-button";
import { Kbd } from "@/components/ui/kbd";

const meta = {
  title: "Primitives/Buttons",
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

export const Variants: Story = {
  render: () => (
    <div className="story-stack">
      <div className="story-row">
        <Button variant="primary">Compose</Button>
        <Button variant="secondary">Save draft</Button>
        <Button variant="ghost">Cancel</Button>
        <Button variant="danger">Delete</Button>
      </div>
      <div className="story-row">
        <Button variant="primary" leadingIcon={<Icon name="plus" size={16} />}>
          New message
        </Button>
        <Button variant="secondary" trailingIcon={<Icon name="arrow-right" size={16} />}>
          Continue
        </Button>
        <Button variant="ghost" leadingIcon={<Icon name="search" size={16} />}>
          Search
        </Button>
        <Button variant="danger" leadingIcon={<Icon name="trash" size={16} />}>
          Move to trash
        </Button>
      </div>
    </div>
  ),
};

export const Sizes: Story = {
  render: () => (
    <div className="story-stack">
      <div className="story-row">
        <Button size="sm" variant="primary">
          Small
        </Button>
        <Button size="md" variant="primary">
          Medium
        </Button>
        <Button size="lg" variant="primary">
          Large
        </Button>
      </div>
      <div style={{ maxWidth: "20rem" }}>
        <Button fullWidth variant="secondary">
          Full width
        </Button>
      </div>
    </div>
  ),
};

export const States: Story = {
  render: () => (
    <div className="story-stack">
      <div className="story-row">
        <Button variant="primary" loading>
          Sending
        </Button>
        <Button variant="secondary" disabled>
          Disabled
        </Button>
        <Button variant="danger" disabled>
          Disabled danger
        </Button>
      </div>
      <div className="story-row">
        <IconButton label="Archive" variant="secondary">
          <Icon name="archive" size={18} />
        </IconButton>
        <IconButton label="Star" variant="ghost">
          <Icon name="star" size={18} />
        </IconButton>
        <IconButton label="Compose" variant="primary">
          <Icon name="edit" size={18} />
        </IconButton>
        <IconButton label="Syncing" loading>
          <Icon name="refresh" size={18} />
        </IconButton>
        <IconButton label="Delete" disabled>
          <Icon name="trash" size={18} />
        </IconButton>
      </div>
    </div>
  ),
};

export const Keyboard: Story = {
  render: () => (
    <div className="story-row">
      <Kbd>⌘</Kbd>
      <Kbd>K</Kbd>
      <Kbd>Esc</Kbd>
      <Kbd>Shift</Kbd>
      <span style={{ color: "var(--muted-foreground)", fontSize: "0.875rem" }}>
        Press <Kbd>⌘</Kbd> <Kbd>K</Kbd> to search
      </span>
    </div>
  ),
};
