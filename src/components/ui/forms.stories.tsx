import { useState, type ReactNode } from "react";

import type { Meta, StoryObj } from "@storybook/react-vite";

import { Icon } from "@/components/icons/icon";
import { Checkbox } from "@/components/ui/checkbox";
import { Combobox } from "@/components/ui/combobox";
import { Input } from "@/components/ui/input";
import { Radio } from "@/components/ui/radio";
import { Select } from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";

const meta = {
  title: "Primitives/Forms",
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

function Field({
  label,
  htmlFor,
  children,
}: {
  label: string;
  htmlFor: string;
  children: ReactNode;
}) {
  return (
    <div>
      <label className="story-label" htmlFor={htmlFor}>
        {label}
      </label>
      {children}
    </div>
  );
}

export const TextFields: Story = {
  render: () => (
    <div className="story-stack" style={{ maxWidth: "24rem" }}>
      <Field label="Email address" htmlFor="field-default">
        <Input id="field-default" defaultValue="ada@example.com" />
      </Field>
      <Field label="Search" htmlFor="field-search">
        <Input
          id="field-search"
          placeholder="Search mail"
          leadingIcon={<Icon name="search" size={16} />}
        />
      </Field>
      <Field label="Password" htmlFor="field-invalid">
        <Input
          id="field-invalid"
          type="password"
          defaultValue="short"
          invalid
          trailingIcon={<Icon name="info" size={16} />}
        />
      </Field>
      <Field label="Disabled" htmlFor="field-disabled">
        <Input id="field-disabled" defaultValue="Read only" disabled />
      </Field>
    </div>
  ),
};

export const TextArea: Story = {
  render: () => (
    <div className="story-stack" style={{ maxWidth: "24rem" }}>
      <Field label="Signature" htmlFor="textarea-default">
        <Textarea id="textarea-default" defaultValue={"Best regards,\nAda"} />
      </Field>
      <Field label="Invalid" htmlFor="textarea-invalid">
        <Textarea id="textarea-invalid" defaultValue="Too long" invalid rows={3} />
      </Field>
    </div>
  ),
};

function SwitchRow({ label, initial = true }: { label: string; initial?: boolean }) {
  const [checked, setChecked] = useState(initial);
  return (
    <div className="story-row" style={{ justifyContent: "space-between", width: "18rem" }}>
      <span style={{ fontSize: "0.875rem" }}>{label}</span>
      <Switch checked={checked} onCheckedChange={setChecked} aria-label={label} />
    </div>
  );
}

export const SelectionControls: Story = {
  render: () => (
    <div className="story-stack">
      <div className="story-row" style={{ gap: "1.5rem" }}>
        <span className="story-row" style={{ gap: "0.5rem", fontSize: "0.875rem" }}>
          <Checkbox defaultChecked aria-label="Unread only" /> Unread only
        </span>
        <span className="story-row" style={{ gap: "0.5rem", fontSize: "0.875rem" }}>
          <Checkbox aria-label="Starred" /> Starred
        </span>
        <span className="story-row" style={{ gap: "0.5rem", fontSize: "0.875rem" }}>
          <Checkbox indeterminate aria-label="Some selected" /> Some selected
        </span>
        <span className="story-row" style={{ gap: "0.5rem", fontSize: "0.875rem" }}>
          <Checkbox disabled aria-label="Disabled" /> Disabled
        </span>
      </div>

      <div className="story-row" style={{ gap: "1.5rem" }}>
        <span className="story-row" style={{ gap: "0.5rem", fontSize: "0.875rem" }}>
          <Radio name="density" defaultChecked aria-label="Comfortable" /> Comfortable
        </span>
        <span className="story-row" style={{ gap: "0.5rem", fontSize: "0.875rem" }}>
          <Radio name="density" aria-label="Compact" /> Compact
        </span>
        <span className="story-row" style={{ gap: "0.5rem", fontSize: "0.875rem" }}>
          <Radio name="density" disabled aria-label="Disabled" /> Disabled
        </span>
      </div>

      <div className="story-stack" style={{ gap: "0.75rem" }}>
        <SwitchRow label="Notifications" />
        <SwitchRow label="Desktop alerts" initial={false} />
        <div className="story-row" style={{ justifyContent: "space-between", width: "18rem" }}>
          <span style={{ fontSize: "0.875rem" }}>Disabled</span>
          <Switch
            checked={false}
            onCheckedChange={() => undefined}
            disabled
            aria-label="Disabled"
          />
        </div>
      </div>

      <div style={{ maxWidth: "18rem" }}>
        <Slider defaultValue={40} aria-label="Volume" />
      </div>
    </div>
  ),
};

const SELECT_OPTIONS = [
  { value: "inbox", label: "Inbox", icon: "inbox" as const },
  { value: "starred", label: "Starred", icon: "star" as const },
  { value: "sent", label: "Sent", icon: "send" as const },
  { value: "archive", label: "Archive", icon: "archive" as const },
];

export const SelectAndCombobox: Story = {
  render: () => (
    <div className="story-stack" style={{ maxWidth: "22rem" }}>
      <Field label="Folder" htmlFor="select-folder">
        <Select
          id="select-folder"
          label="Folder"
          value="inbox"
          onValueChange={() => undefined}
          options={SELECT_OPTIONS}
        />
      </Field>
      <Field label="Empty selection" htmlFor="select-empty">
        <Select
          id="select-empty"
          label="Empty selection"
          value={null}
          onValueChange={() => undefined}
          options={SELECT_OPTIONS}
          placeholder="Choose a folder…"
        />
      </Field>
      <Field label="Recipient" htmlFor="combobox-recipient">
        <Combobox
          id="combobox-recipient"
          label="Recipient"
          value={null}
          onValueChange={() => undefined}
          placeholder="Search people…"
          options={[
            { value: "ada", label: "Ada Lovelace" },
            { value: "grace", label: "Grace Hopper" },
            { value: "alan", label: "Alan Turing" },
          ]}
        />
      </Field>
      <Field label="Disabled" htmlFor="select-disabled">
        <Select
          id="select-disabled"
          label="Disabled"
          value="inbox"
          onValueChange={() => undefined}
          options={SELECT_OPTIONS}
          disabled
        />
      </Field>
    </div>
  ),
};
