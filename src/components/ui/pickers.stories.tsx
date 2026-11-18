import { useState } from "react";

import type { Meta, StoryObj } from "@storybook/react-vite";

import { Calendar } from "@/components/ui/calendar";
import { DateTimePicker } from "@/components/ui/datetime-picker";
import { IconPicker, type IconColorValue } from "@/components/ui/icon-picker";
import { TimePicker } from "@/components/ui/time-picker";
import { TimezoneSelect } from "@/components/ui/timezone-select";

const meta = {
  title: "Primitives/Pickers",
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

export const MonthCalendar: Story = {
  render: () => (
    <div
      style={{
        border: "1px solid var(--border)",
        borderRadius: "var(--r-xl)",
        background: "var(--surface)",
        padding: "1rem",
        width: "20rem",
      }}
    >
      <Calendar value="2026-03-18" onChange={() => undefined} />
    </div>
  ),
};

function TimePickerExample({ hour12 = false }: { hour12?: boolean }) {
  const [value, setValue] = useState("09:30");
  return (
    <div style={{ width: "14rem" }}>
      <TimePicker value={value} onChange={setValue} hour12={hour12} minuteStep={5} />
    </div>
  );
}

export const Times: Story = {
  render: () => (
    <div className="story-stack">
      <TimePickerExample />
      <TimePickerExample hour12 />
    </div>
  ),
};

function DateTimeExample() {
  const [date, setDate] = useState<string | null>("2026-03-18");
  const [time, setTime] = useState("09:30");
  const [timeZone, setTimeZone] = useState("Europe/London");
  return (
    <DateTimePicker
      date={date}
      time={time}
      timeZone={timeZone}
      onDateChange={setDate}
      onTimeChange={setTime}
      onTimeZoneChange={setTimeZone}
      minuteStep={5}
    />
  );
}

export const DateAndTime: Story = {
  render: () => <DateTimeExample />,
};

export const TimeZones: Story = {
  render: () => (
    <div style={{ width: "22rem" }}>
      <TimezoneSelect
        value="Europe/London"
        onChange={() => undefined}
        now={new Date("2026-03-15T12:00:00Z")}
      />
    </div>
  ),
};

function IconPickerExample() {
  const [value, setValue] = useState<IconColorValue>({ icon: "mail", color: "#4f46e5" });
  return <IconPicker value={value} onChange={setValue} />;
}

export const IconsAndColours: Story = {
  render: () => (
    <div style={{ maxWidth: "30rem" }}>
      <IconPickerExample />
    </div>
  ),
};
