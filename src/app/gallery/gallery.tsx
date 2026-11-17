"use client";

import { useState, type ReactNode } from "react";

import { Icon, ICON_NAMES } from "@/components/icons/icon";
import { Accordion } from "@/components/ui/accordion";
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
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog } from "@/components/ui/dialog";
import { IconButton } from "@/components/ui/icon-button";
import { Input } from "@/components/ui/input";
import { Kbd } from "@/components/ui/kbd";
import { Progress } from "@/components/ui/progress";
import { Radio } from "@/components/ui/radio";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { Slider } from "@/components/ui/slider";
import { Spinner } from "@/components/ui/spinner";
import { EmptyState, ErrorState } from "@/components/ui/states";
import { Switch } from "@/components/ui/switch";
import { Tabs } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { Tooltip } from "@/components/ui/tooltip";
import { useTheme } from "@/components/theme/theme-provider";
import {
  ACCENTS,
  DENSITIES,
  THEMES,
  type Accent,
  type Density,
  type Theme,
} from "@/lib/theme/theme";

function Section({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: ReactNode;
}) {
  return (
    <section className="rounded-xl border border-border bg-surface p-6">
      <h2 className="text-base font-semibold tracking-tight">{title}</h2>
      {description ? (
        <p className="mt-1 text-sm leading-6 text-muted-foreground">{description}</p>
      ) : null}
      <div className="mt-5">{children}</div>
    </section>
  );
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-2 border-b border-border py-4 last:border-b-0 sm:flex-row sm:items-center sm:justify-between">
      <span className="text-sm font-medium text-muted-foreground">{label}</span>
      <div className="flex flex-wrap items-center gap-2">{children}</div>
    </div>
  );
}

export function GalleryShowcase() {
  const { settings, setTheme, setAccent, setDensity } = useTheme();
  const [switchOn, setSwitchOn] = useState(true);
  const [checked, setChecked] = useState(true);
  const [radio, setRadio] = useState("a");
  const [slider, setSlider] = useState(40);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [progress, setProgress] = useState(65);

  return (
    <main className="min-h-full px-6 py-12">
      <div className="mx-auto flex max-w-5xl flex-col gap-6">
        <header>
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-accent">
            Design system
          </p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight">Component gallery</h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
            Every component with its states. Development only — this route returns 404 in a
            production build.
          </p>
        </header>

        <Section title="Preferences" description="Theme, accent colour and density apply live.">
          <div className="flex flex-col gap-5">
            <div>
              <p className="mb-2 text-sm font-medium">Theme</p>
              <div className="flex gap-2">
                {THEMES.map((theme: Theme) => (
                  <Button
                    key={theme}
                    variant={settings.theme === theme ? "primary" : "secondary"}
                    onClick={() => {
                      setTheme(theme);
                    }}
                  >
                    {theme}
                  </Button>
                ))}
              </div>
            </div>
            <div>
              <p className="mb-2 text-sm font-medium">Accent</p>
              <div className="flex flex-wrap gap-2">
                {ACCENTS.map((accent: Accent) => (
                  <button
                    key={accent}
                    type="button"
                    onClick={() => {
                      setAccent(accent);
                    }}
                    aria-pressed={settings.accent === accent}
                    className={
                      settings.accent === accent
                        ? "rounded-md border-2 border-accent px-3 py-1.5 text-sm capitalize"
                        : "rounded-md border border-border px-3 py-1.5 text-sm capitalize text-muted-foreground hover:text-foreground"
                    }
                  >
                    {accent}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <p className="mb-2 text-sm font-medium">Density</p>
              <div className="flex gap-2">
                {DENSITIES.map((density: Density) => (
                  <Button
                    key={density}
                    variant={settings.density === density ? "primary" : "secondary"}
                    onClick={() => {
                      setDensity(density);
                    }}
                  >
                    {density}
                  </Button>
                ))}
              </div>
            </div>
          </div>
        </Section>

        <Section title="Buttons" description="Variants, sizes, icons, loading and disabled states.">
          <div className="flex flex-col gap-3">
            <Row label="Variants">
              <Button variant="primary">Primary</Button>
              <Button variant="secondary">Secondary</Button>
              <Button variant="ghost">Ghost</Button>
              <Button variant="danger">Danger</Button>
            </Row>
            <Row label="Sizes">
              <Button size="sm">Small</Button>
              <Button size="md">Medium</Button>
              <Button size="lg">Large</Button>
            </Row>
            <Row label="With icon">
              <Button leadingIcon={<Icon name="plus" size={16} />}>New message</Button>
              <Button trailingIcon={<Icon name="arrow-right" size={16} />}>Continue</Button>
            </Row>
            <Row label="States">
              <Button loading>Loading</Button>
              <Button disabled>Disabled</Button>
              <Button fullWidth>Full width</Button>
            </Row>
            <Row label="Icon buttons">
              <IconButton label="Search">
                <Icon name="search" />
              </IconButton>
              <IconButton label="Settings" variant="secondary">
                <Icon name="settings" />
              </IconButton>
              <IconButton label="Delete" variant="ghost" className="text-danger">
                <Icon name="trash" />
              </IconButton>
              <IconButton label="Add" variant="primary">
                <Icon name="plus" />
              </IconButton>
            </Row>
          </div>
        </Section>

        <Section
          title="Form controls"
          description="Inputs, textareas, checkboxes, radios, switches and sliders."
        >
          <div className="flex flex-col gap-4">
            <Row label="Input">
              <Input aria-label="Default input" placeholder="you@example.com" />
              <Input aria-label="Invalid input" invalid defaultValue="not-an-email" />
              <Input aria-label="Disabled input" disabled placeholder="Disabled" />
              <Input
                aria-label="Input with icon"
                leadingIcon={<Icon name="search" size={16} />}
                placeholder="Search"
              />
            </Row>
            <Row label="Textarea">
              <Textarea aria-label="Textarea" placeholder="Write a reply…" />
            </Row>
            <Row label="Checkbox">
              <span className="flex items-center gap-2 text-sm">
                <Checkbox
                  aria-label="Checked"
                  checked={checked}
                  onChange={(event) => {
                    setChecked(event.target.checked);
                  }}
                />
                Checked
              </span>
              <span className="flex items-center gap-2 text-sm">
                <Checkbox aria-label="Indeterminate" indeterminate />
                Indeterminate
              </span>
              <span className="flex items-center gap-2 text-sm">
                <Checkbox aria-label="Disabled" disabled />
                Disabled
              </span>
            </Row>
            <Row label="Radio">
              <span className="flex items-center gap-2 text-sm">
                <Radio
                  aria-label="Alpha"
                  name="demo"
                  value="a"
                  checked={radio === "a"}
                  onChange={() => {
                    setRadio("a");
                  }}
                />
                Alpha
              </span>
              <span className="flex items-center gap-2 text-sm">
                <Radio
                  aria-label="Beta"
                  name="demo"
                  value="b"
                  checked={radio === "b"}
                  onChange={() => {
                    setRadio("b");
                  }}
                />
                Beta
              </span>
            </Row>
            <Row label="Switch">
              <Switch
                checked={switchOn}
                onCheckedChange={setSwitchOn}
                aria-label="Toggle notifications"
              />
              <span className="text-sm text-muted-foreground">{switchOn ? "On" : "Off"}</span>
            </Row>
            <Row label="Slider">
              <div className="w-64">
                <Slider
                  aria-label="Volume"
                  min={0}
                  max={100}
                  value={slider}
                  onChange={(event) => {
                    setSlider(Number(event.target.value));
                  }}
                />
              </div>
              <span className="text-sm tabular text-muted-foreground">{slider}</span>
            </Row>
          </div>
        </Section>

        <Section
          title="Display"
          description="Badges, avatars, kbd, spinners, progress and separators."
        >
          <div className="flex flex-col gap-3">
            <Row label="Badges">
              <Badge>Neutral</Badge>
              <Badge tone="accent">Accent</Badge>
              <Badge tone="success" dot>
                Delivered
              </Badge>
              <Badge tone="warning">Pending</Badge>
              <Badge tone="danger">Failed</Badge>
            </Row>
            <Row label="Avatars">
              <Avatar name="Ada Lovelace" size="xs" />
              <Avatar name="Ada Lovelace" size="sm" />
              <Avatar name="Grace Hopper" size="md" />
              <Avatar name="Alan Turing" size="lg" />
            </Row>
            <Row label="Kbd">
              <Kbd>⌘</Kbd>
              <Kbd>K</Kbd>
              <span className="text-sm text-muted-foreground">Quick actions</span>
            </Row>
            <Row label="Spinner">
              <Spinner className="size-5 text-accent" />
              <Spinner className="size-5 text-muted-foreground" />
            </Row>
            <Row label="Progress">
              <div className="flex w-64 items-center gap-3">
                <Progress value={progress} label="Demo progress" />
                <span className="text-sm tabular text-muted-foreground">{progress}%</span>
              </div>
              <Button
                size="sm"
                onClick={() => {
                  setProgress((v) => (v >= 100 ? 0 : v + 10));
                }}
              >
                Advance
              </Button>
            </Row>
            <Row label="Separator">
              <span className="text-sm">Above</span>
              <Separator className="w-24" />
              <span className="text-sm">Below</span>
            </Row>
            <Separator label="Section" className="w-full" />
          </div>
        </Section>

        <Section title="Feedback" description="Alerts, empty states and error states.">
          <div className="flex flex-col gap-3">
            <Alert tone="info" title="Info" icon={<Icon name="info" size={16} />}>
              Your changes have been saved.
            </Alert>
            <Alert tone="success" title="Success" icon={<Icon name="check-circle" size={16} />}>
              The message was delivered.
            </Alert>
            <Alert tone="warning" title="Warning" icon={<Icon name="alert-triangle" size={16} />}>
              Your mailbox is almost full.
            </Alert>
            <Alert tone="danger" title="Error" icon={<Icon name="alert-circle" size={16} />}>
              We could not send that message. Please try again.
            </Alert>
            <EmptyState
              icon={<Icon name="inbox" size={28} />}
              title="No messages"
              description="Messages you receive will appear here."
              action={<Button variant="primary">Compose</Button>}
            />
            <ErrorState
              title="Could not load messages"
              description="Check your connection and try again."
              action={<Button>Retry</Button>}
            />
          </div>
        </Section>

        <Section title="Overlays" description="Tooltips, dialogs, tabs and accordions.">
          <div className="flex flex-col gap-6">
            <Row label="Tooltip">
              <Tooltip content="Search messages">
                <Button variant="secondary">Hover or focus</Button>
              </Tooltip>
            </Row>
            <Row label="Dialog">
              <Button
                variant="primary"
                onClick={() => {
                  setDialogOpen(true);
                }}
              >
                Open dialog
              </Button>
            </Row>
            <div>
              <p className="mb-2 text-sm font-medium">Tabs</p>
              <Tabs
                items={[
                  {
                    value: "inbox",
                    label: "Inbox",
                    content: <p className="text-sm">Inbox panel</p>,
                  },
                  {
                    value: "starred",
                    label: "Starred",
                    content: <p className="text-sm">Starred panel</p>,
                  },
                  { value: "sent", label: "Sent", content: <p className="text-sm">Sent panel</p> },
                  {
                    value: "drafts",
                    label: "Drafts",
                    content: <p className="text-sm">Drafts panel</p>,
                    disabled: true,
                  },
                ]}
              />
            </div>
            <div>
              <p className="mb-2 text-sm font-medium">Accordion</p>
              <Accordion
                items={[
                  {
                    value: "a",
                    title: "What is this?",
                    content: <p>A private, single-owner mail client.</p>,
                  },
                  {
                    value: "b",
                    title: "How do I connect an account?",
                    content: <p>Open Settings and add a provider.</p>,
                  },
                ]}
              />
            </div>
          </div>
        </Section>

        <Section title="Cards" description="Surfaces with header, content and footer.">
          <Card>
            <CardHeader>
              <CardTitle>Account</CardTitle>
              <CardDescription>Manage your profile and security.</CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-sm leading-6 text-muted-foreground">
                Cards use the shared surface, border and elevation tokens.
              </p>
            </CardContent>
            <CardFooter>
              <Button variant="secondary" size="sm">
                Cancel
              </Button>
              <Button variant="primary" size="sm">
                Save
              </Button>
            </CardFooter>
          </Card>
        </Section>

        <Section
          title="Skeletons"
          description="Shimmer placeholders; disabled under reduced motion."
        >
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-3">
              <Skeleton className="h-6 w-3/4" />
              <Skeleton className="h-3.5 w-full" />
              <Skeleton className="h-3.5 w-5/6" />
              <Skeleton className="h-3.5 w-2/3" />
            </div>
            <div className="flex items-center gap-3">
              <Skeleton className="size-12 rounded-full" />
              <div className="flex-1 space-y-2">
                <Skeleton className="h-3.5 w-40" />
                <Skeleton className="h-3 w-56" />
              </div>
            </div>
          </div>
        </Section>

        <Section title="Icons" description={`${String(ICON_NAMES.length)} icons in the set.`}>
          <div className="grid grid-cols-6 gap-4 sm:grid-cols-10">
            {ICON_NAMES.map((name) => (
              <div key={name} className="flex flex-col items-center gap-1 text-muted-foreground">
                <Icon name={name} size={20} />
                <span className="w-full truncate text-center text-2xs">{name}</span>
              </div>
            ))}
          </div>
        </Section>
      </div>

      <Dialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        title="Delete message"
        description="This action cannot be undone."
        footer={
          <>
            <Button
              variant="secondary"
              onClick={() => {
                setDialogOpen(false);
              }}
            >
              Cancel
            </Button>
            <Button
              variant="danger"
              onClick={() => {
                setDialogOpen(false);
              }}
            >
              Delete
            </Button>
          </>
        }
      >
        <p className="text-sm leading-6 text-muted-foreground">
          The message will move to Trash and can be restored within 30 days.
        </p>
      </Dialog>
    </main>
  );
}
