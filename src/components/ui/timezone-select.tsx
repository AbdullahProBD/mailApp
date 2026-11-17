"use client";

import { useMemo } from "react";

import { formatOffset } from "@/lib/datetime/timezone";
import { Combobox } from "./combobox";

const FALLBACK_ZONES = [
  "UTC",
  "America/New_York",
  "America/Chicago",
  "America/Denver",
  "America/Los_Angeles",
  "Europe/London",
  "Europe/Paris",
  "Europe/Berlin",
  "Asia/Kolkata",
  "Asia/Tokyo",
  "Australia/Sydney",
];

function supportedZones(): string[] {
  const intl = Intl as unknown as { supportedValuesOf?: (key: string) => string[] };
  try {
    const values = intl.supportedValuesOf?.("timeZone");
    if (values && values.length > 0) {
      return ["UTC", ...values.filter((zone) => zone !== "UTC")];
    }
  } catch {
    // Older runtimes without Intl.supportedValuesOf fall back to a short list.
  }
  return FALLBACK_ZONES;
}

export interface TimezoneSelectProps {
  value: string;
  onChange: (zone: string) => void;
  className?: string;
  /** Reference instant for the offset label; defaults to now. */
  now?: Date;
}

export function TimezoneSelect({ value, onChange, className, now }: TimezoneSelectProps) {
  const options = useMemo(() => supportedZones().map((zone) => ({ value: zone, label: zone })), []);
  const offset = useMemo(() => formatOffset(now ?? new Date(), value), [now, value]);

  return (
    <div className={className}>
      <Combobox
        label="Time zone"
        value={value}
        onValueChange={onChange}
        options={options}
        placeholder="Search time zones…"
      />
      <p className="mt-1.5 text-xs text-muted-foreground">Current offset: {offset}</p>
    </div>
  );
}
