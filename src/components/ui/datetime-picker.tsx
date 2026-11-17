"use client";

import { Calendar } from "./calendar";
import { TimePicker } from "./time-picker";
import { TimezoneSelect } from "./timezone-select";

export interface DateTimePickerProps {
  /** Selected day as YYYY-MM-DD, or null. */
  date: string | null;
  /** "HH:MM" in 24-hour form. */
  time: string;
  /** IANA zone the value should be interpreted and displayed in. */
  timeZone: string;
  onDateChange: (date: string) => void;
  onTimeChange: (time: string) => void;
  onTimeZoneChange: (zone: string) => void;
  hour12?: boolean;
  minuteStep?: number;
  minDate?: string;
  maxDate?: string;
  className?: string;
}

/**
 * Date + time + zone. The caller converts the parts to a UTC instant with
 * `zonedTimeToUtc` from `@/lib/datetime/timezone`, which handles DST.
 */
export function DateTimePicker({
  date,
  time,
  timeZone,
  onDateChange,
  onTimeChange,
  onTimeZoneChange,
  hour12 = false,
  minuteStep = 5,
  minDate,
  maxDate,
  className,
}: DateTimePickerProps) {
  return (
    <div className={className}>
      <div className="rounded-xl border border-border bg-surface p-4">
        <Calendar value={date} onChange={onDateChange} min={minDate} max={maxDate} />
      </div>
      <div className="mt-4 flex flex-wrap items-end gap-4">
        <div>
          <p className="mb-1.5 text-sm font-medium">Time</p>
          <TimePicker
            value={time}
            onChange={onTimeChange}
            hour12={hour12}
            minuteStep={minuteStep}
          />
        </div>
        <div className="min-w-56 flex-1">
          <p className="mb-1.5 text-sm font-medium">Time zone</p>
          <TimezoneSelect value={timeZone} onChange={onTimeZoneChange} />
        </div>
      </div>
    </div>
  );
}
