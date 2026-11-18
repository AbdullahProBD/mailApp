import type { Meta, StoryObj } from "@storybook/react-vite";

import { Icon } from "@/components/icons/icon";
import { Alert } from "@/components/ui/alert";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";
import { Skeleton, SkeletonGroup } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { EmptyState, ErrorState } from "@/components/ui/states";

const meta = {
  title: "Primitives/Display",
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

export const Badges: Story = {
  render: () => (
    <div className="story-stack">
      <div className="story-row">
        <Badge>Neutral</Badge>
        <Badge tone="accent">Accent</Badge>
        <Badge tone="success">Success</Badge>
        <Badge tone="warning">Warning</Badge>
        <Badge tone="danger">Danger</Badge>
      </div>
      <div className="story-row">
        <Badge size="sm" tone="accent" dot>
          Inbox
        </Badge>
        <Badge size="sm" tone="success" dot>
          Active
        </Badge>
        <Badge size="sm" tone="warning" dot>
          Needs attention
        </Badge>
        <Badge size="sm" tone="danger" dot>
          Disconnected
        </Badge>
      </div>
    </div>
  ),
};

export const Avatars: Story = {
  render: () => (
    <div className="story-row">
      <Avatar name="Ada Lovelace" size="xs" />
      <Avatar name="Grace Hopper" size="sm" />
      <Avatar name="Alan Turing" size="md" />
      <Avatar name="Edsger Dijkstra" size="lg" />
      <Avatar name="mail@example.com" size="lg" />
    </div>
  ),
};

export const ProgressAndSpinner: Story = {
  render: () => (
    <div className="story-stack" style={{ maxWidth: "24rem" }}>
      <Progress value={35} label="Storage used" />
      <Progress value={68} tone="success" label="Import progress" />
      <Progress value={82} tone="warning" label="Quota warning" />
      <Progress value={96} tone="danger" label="Quota critical" />
      <div className="story-row">
        <Spinner className="size-4" label="Loading" />
        <Spinner className="size-6" label="Loading" />
        <Spinner className="size-8" label="Loading" />
      </div>
    </div>
  ),
};

export const LoadingSkeletons: Story = {
  render: () => (
    <div style={{ maxWidth: "26rem" }}>
      <SkeletonGroup className="story-stack" label="Loading messages">
        <div className="story-row">
          <Skeleton className="size-10 rounded-full" />
          <div style={{ display: "grid", flex: 1, gap: "0.5rem" }}>
            <Skeleton className="h-3 w-1/2" />
            <Skeleton className="h-3 w-3/4" />
          </div>
        </div>
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-3 w-2/3" />
      </SkeletonGroup>
    </div>
  ),
};

export const Alerts: Story = {
  render: () => (
    <div className="story-stack" style={{ maxWidth: "32rem" }}>
      <Alert tone="info" title="Sync paused" icon={<Icon name="info" size={16} />}>
        Mail will resume syncing when the connection is restored.
      </Alert>
      <Alert tone="success" title="Account connected" icon={<Icon name="check-circle" size={16} />}>
        Your IMAP and SMTP settings were verified.
      </Alert>
      <Alert
        tone="warning"
        title="Storage almost full"
        icon={<Icon name="alert-triangle" size={16} />}
      >
        Free up space or messages may stop arriving.
      </Alert>
      <Alert tone="danger" title="Sign-in failed" icon={<Icon name="alert-circle" size={16} />}>
        Re-authentication is required before mail can be sent.
      </Alert>
    </div>
  ),
};

export const Separators: Story = {
  render: () => (
    <div className="story-stack" style={{ maxWidth: "24rem" }}>
      <p style={{ fontSize: "0.875rem" }}>Above</p>
      <Separator />
      <Separator label="Today" />
      <div className="story-row" style={{ height: "2rem" }}>
        <span style={{ fontSize: "0.875rem" }}>Left</span>
        <Separator orientation="vertical" />
        <span style={{ fontSize: "0.875rem" }}>Right</span>
      </div>
    </div>
  ),
};

export const EmptyAndError: Story = {
  render: () => (
    <div className="story-stack" style={{ maxWidth: "30rem" }}>
      <EmptyState
        icon={<Icon name="inbox" size={28} />}
        title="Inbox zero"
        description="Nothing needs your attention. New mail will appear here."
        action={<Button variant="secondary">Refresh</Button>}
      />
      <ErrorState
        title="Could not load messages"
        description="The mail server did not respond. Try again in a moment."
        action={<Button variant="secondary">Try again</Button>}
      />
    </div>
  ),
};

export const Cards: Story = {
  render: () => (
    <div className="story-stack" style={{ maxWidth: "26rem" }}>
      <Card>
        <CardHeader>
          <CardTitle>Personal account</CardTitle>
          <CardDescription>ada@example.com</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="story-row" style={{ justifyContent: "space-between" }}>
            <Badge tone="success" dot size="sm">
              Active
            </Badge>
            <span style={{ fontSize: "0.75rem", color: "var(--muted-foreground)" }}>
              Synced 2 minutes ago
            </span>
          </div>
          <div style={{ marginTop: "1rem" }}>
            <Progress value={42} label="Storage used" />
          </div>
        </CardContent>
        <CardFooter>
          <Button variant="secondary" size="sm">
            Manage
          </Button>
          <Button variant="ghost" size="sm">
            Details
          </Button>
        </CardFooter>
      </Card>
    </div>
  ),
};
