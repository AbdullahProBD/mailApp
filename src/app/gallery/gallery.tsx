"use client";

import { useEffect, useState, type ReactNode } from "react";

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
import { Breadcrumb } from "@/components/ui/breadcrumb";
import { Calendar } from "@/components/ui/calendar";
import { Combobox } from "@/components/ui/combobox";
import { CommandPalette, type CommandItem } from "@/components/ui/command";
import { DateTimePicker } from "@/components/ui/datetime-picker";
import { Drawer } from "@/components/ui/drawer";
import { DropdownMenu, type MenuEntry } from "@/components/ui/dropdown-menu";
import { IconPicker, type IconColorValue } from "@/components/ui/icon-picker";
import { Pagination } from "@/components/ui/pagination";
import { Popover } from "@/components/ui/popover";
import { Resizable } from "@/components/ui/resizable";
import { Select } from "@/components/ui/select";
import { TimePicker } from "@/components/ui/time-picker";
import { TimezoneSelect } from "@/components/ui/timezone-select";
import { useToast } from "@/components/ui/toast";
import { formatInZone, zonedTimeToUtc } from "@/lib/datetime/timezone";

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
  const { toast } = useToast();
  const [switchOn, setSwitchOn] = useState(true);
  const [checked, setChecked] = useState(true);
  const [radio, setRadio] = useState("a");
  const [slider, setSlider] = useState(40);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [progress, setProgress] = useState(65);
  const [select, setSelect] = useState<string | null>("inbox");
  const [combobox, setCombobox] = useState<string | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [commandOpen, setCommandOpen] = useState(false);
  const [date, setDate] = useState<string | null>(null);
  const [time, setTime] = useState("09:00");
  const [timeZone, setTimeZone] = useState("UTC");
  const [icon, setIcon] = useState<IconColorValue>({ icon: "mail", color: "#4f46e5" });
  const [page, setPage] = useState(1);

  useEffect(() => {
    const onKeyDown = (event: globalThis.KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setCommandOpen(true);
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
    };
  }, []);

  const selectOptions = [
    { value: "inbox", label: "Inbox", icon: "inbox" as const },
    { value: "starred", label: "Starred", icon: "star" as const },
    { value: "sent", label: "Sent", icon: "send" as const },
    { value: "archive", label: "Archive", icon: "archive" as const },
  ];
  const comboboxOptions = [
    { value: "ada", label: "Ada Lovelace" },
    { value: "grace", label: "Grace Hopper" },
    { value: "alan", label: "Alan Turing" },
    { value: "edsger", label: "Edsger Dijkstra" },
  ];
  const menuItems: MenuEntry[] = [
    {
      type: "item",
      value: "reply",
      label: "Reply",
      icon: "arrow-left",
      shortcut: "R",
      onSelect: () => {},
    },
    { type: "item", value: "forward", label: "Forward", icon: "arrow-right", onSelect: () => {} },
    { type: "separator" },
    { type: "label", label: "Message" },
    { type: "item", value: "archive", label: "Archive", icon: "archive", onSelect: () => {} },
    {
      type: "item",
      value: "delete",
      label: "Delete",
      icon: "trash",
      danger: true,
      onSelect: () => {},
    },
  ];
  const commands: CommandItem[] = [
    { id: "compose", label: "Compose message", icon: "edit", shortcut: "C", onSelect: () => {} },
    { id: "search", label: "Search mail", icon: "search", shortcut: "⌘K", onSelect: () => {} },
    { id: "settings", label: "Open settings", icon: "settings", onSelect: () => {} },
    { id: "logout", label: "Sign out", icon: "log-out", onSelect: () => {} },
  ];

  function toInstant(): Date | null {
    if (!date) return null;
    const [year, month, day] = date.split("-").map(Number);
    const [hour, minute] = time.split(":").map(Number);
    return zonedTimeToUtc(
      {
        year: year ?? 1970,
        month: month ?? 1,
        day: day ?? 1,
        hour: hour ?? 0,
        minute: minute ?? 0,
      },
      timeZone,
    );
  }
  const instant = toInstant();
  const triggerClass =
    "inline-flex h-[var(--control-h-md)] items-center justify-center rounded-md border border-border bg-surface px-[var(--control-px)] text-sm font-medium text-foreground shadow-xs transition-colors hover:bg-surface-2";

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

        <Section title="Navigation" description="Menus, selects, breadcrumbs and pagination.">
          <div className="flex flex-col gap-5">
            <Row label="Dropdown menu">
              <DropdownMenu
                trigger="More"
                triggerClassName={triggerClass}
                triggerLabel="More actions"
                items={menuItems}
              />
            </Row>
            <Row label="Select">
              <div className="w-56">
                <Select
                  label="Folder"
                  value={select}
                  onValueChange={setSelect}
                  options={selectOptions}
                />
              </div>
              <span className="text-sm text-muted-foreground">{select ?? "none"}</span>
            </Row>
            <Row label="Combobox">
              <div className="w-64">
                <Combobox
                  label="Contact"
                  value={combobox}
                  onValueChange={setCombobox}
                  options={comboboxOptions}
                />
              </div>
              <span className="text-sm text-muted-foreground">{combobox ?? "none"}</span>
            </Row>
            <Row label="Breadcrumb">
              <Breadcrumb
                items={[{ label: "Mail", href: "/" }, { label: "Projects" }, { label: "Roadmap" }]}
              />
            </Row>
            <Row label="Pagination">
              <Pagination page={page} pageCount={8} onPageChange={setPage} />
            </Row>
            <Row label="Resizable">
              <div className="w-full">
                <Resizable
                  className="h-40 rounded-xl border border-border"
                  handleLabel="Resize demo"
                  first={
                    <div className="flex h-full items-center justify-center bg-surface-2 text-sm text-muted-foreground">
                      Sidebar
                    </div>
                  }
                  second={
                    <div className="flex h-full items-center justify-center bg-surface text-sm text-muted-foreground">
                      Content
                    </div>
                  }
                />
              </div>
            </Row>
          </div>
        </Section>

        <Section
          title="Overlays & feedback"
          description="Popovers, drawers, toasts and the command palette."
        >
          <div className="flex flex-col gap-5">
            <Row label="Popover">
              <Popover trigger="Options" triggerClassName={triggerClass} triggerLabel="Options">
                {(close) => (
                  <div className="p-1">
                    <button
                      type="button"
                      onClick={() => {
                        toast({ title: "Popover action", tone: "success" });
                        close();
                      }}
                      className="w-full rounded-md px-2 py-1.5 text-left text-sm hover:bg-surface-2"
                    >
                      Run action
                    </button>
                  </div>
                )}
              </Popover>
            </Row>
            <Row label="Drawer">
              <Button
                variant="secondary"
                onClick={() => {
                  setDrawerOpen(true);
                }}
              >
                Open panel
              </Button>
            </Row>
            <Row label="Toast">
              <Button
                variant="secondary"
                onClick={() => {
                  toast({
                    title: "Message archived",
                    description: "It was moved out of the inbox.",
                    tone: "success",
                    action: { label: "Undo", onClick: () => undefined },
                  });
                }}
              >
                Show toast
              </Button>
              <Button
                variant="secondary"
                onClick={() => {
                  toast({
                    title: "Could not send message",
                    description: "The recipient address was rejected.",
                    tone: "danger",
                  });
                }}
              >
                Show error
              </Button>
            </Row>
            <Row label="Command palette">
              <Button
                variant="secondary"
                onClick={() => {
                  setCommandOpen(true);
                }}
              >
                Open palette
              </Button>
              <span className="flex items-center gap-1 text-sm text-muted-foreground">
                or press <Kbd>⌘</Kbd>
                <Kbd>K</Kbd>
              </span>
            </Row>
          </div>
        </Section>

        <Section
          title="Date & time"
          description="Calendar, time, timezone and a combined picker. The instant is DST-safe."
        >
          <div className="flex flex-col gap-5">
            <Row label="Calendar">
              <div className="w-72">
                <Calendar value={date} onChange={setDate} />
              </div>
              <span className="text-sm text-muted-foreground">{date ?? "none"}</span>
            </Row>
            <Row label="Time">
              <TimePicker value={time} onChange={setTime} hour12 />
              <span className="text-sm tabular text-muted-foreground">{time}</span>
            </Row>
            <Row label="Time zone">
              <div className="w-64">
                <TimezoneSelect value={timeZone} onChange={setTimeZone} />
              </div>
            </Row>
            <div className="rounded-xl border border-border bg-surface-2 p-4">
              <p className="text-sm font-medium">Resolved instant</p>
              <p className="mt-1 font-mono text-xs text-muted-foreground">
                {instant ? instant.toISOString() : "Select a date to see the UTC instant"}
              </p>
              {instant ? (
                <p className="mt-1 text-xs text-muted-foreground">
                  In {timeZone}: {formatInZone(instant, timeZone)}
                </p>
              ) : null}
            </div>
            <DateTimePicker
              date={date}
              time={time}
              timeZone={timeZone}
              onDateChange={setDate}
              onTimeChange={setTime}
              onTimeZoneChange={setTimeZone}
              hour12
            />
          </div>
        </Section>

        <Section
          title="Icon & colour picker"
          description="Searchable icons with a curated palette."
        >
          <div className="w-72">
            <IconPicker value={icon} onChange={setIcon} />
          </div>
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

      <Drawer
        open={drawerOpen}
        onOpenChange={setDrawerOpen}
        title="Message details"
        description="Headers and delivery information."
        footer={
          <>
            <Button
              variant="secondary"
              onClick={() => {
                setDrawerOpen(false);
              }}
            >
              Close
            </Button>
            <Button variant="primary">Reply</Button>
          </>
        }
      >
        <dl className="space-y-3">
          {[
            ["From", "Ada Lovelace <ada@example.com>"],
            ["To", "owner@example.com"],
            ["Subject", "Design review notes"],
            ["Date", "Today, 09:41"],
          ].map(([term, value]) => (
            <div key={term} className="grid grid-cols-24 gap-2">
              <dt className="text-muted-foreground">{term}</dt>
              <dd className="col-span-23 text-foreground">{value}</dd>
            </div>
          ))}
        </dl>
      </Drawer>

      <CommandPalette open={commandOpen} onOpenChange={setCommandOpen} commands={commands} />
    </main>
  );
}
