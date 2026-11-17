"use client";

import { useRef, type ClipboardEvent, type KeyboardEvent } from "react";

/** Accessible segmented numeric input that still exposes one form value. */
export function CodeInput({
  id,
  name,
  label,
  value,
  onChange,
  length = 6,
  inputClassName,
  autoComplete = true,
}: {
  id: string;
  name: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  length?: number;
  inputClassName?: string;
  autoComplete?: boolean;
}) {
  const refs = useRef<Array<HTMLInputElement | null>>([]);
  const digits = Array.from({ length }, (_, index) => value[index] ?? "");

  function applyDigits(raw: string, focusIndex?: number) {
    const next = raw.replace(/\D/g, "").slice(0, length);
    onChange(next);
    if (focusIndex !== undefined) {
      refs.current[Math.min(focusIndex, length - 1)]?.focus();
    }
  }

  function handlePaste(event: ClipboardEvent<HTMLDivElement>) {
    const pasted = event.clipboardData.getData("text").replace(/\D/g, "");
    if (!pasted) return;
    event.preventDefault();
    applyDigits(pasted, pasted.length >= length ? length - 1 : pasted.length);
  }

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>, index: number) {
    if (event.key === "ArrowLeft" && index > 0) {
      event.preventDefault();
      refs.current[index - 1]?.focus();
    } else if (event.key === "ArrowRight" && index < length - 1) {
      event.preventDefault();
      refs.current[index + 1]?.focus();
    } else if (event.key === "Backspace") {
      const targetIndex = digits[index] ? index : index - 1;
      if (targetIndex >= 0) {
        event.preventDefault();
        const next = [...digits];
        next[targetIndex] = "";
        onChange(next.join(""));
        refs.current[targetIndex]?.focus();
      }
    }
  }

  return (
    <fieldset className="min-w-0" aria-describedby={`${id}-hint`}>
      <legend className="text-sm font-medium">{label}</legend>
      <input type="hidden" name={name} value={value} />
      <div className="mt-2 flex gap-2" onPaste={handlePaste}>
        {digits.map((digit, index) => (
          <input
            key={`${id}-${String(index)}`}
            ref={(element) => {
              refs.current[index] = element;
            }}
            id={index === 0 ? id : undefined}
            aria-label={`${label}, digit ${String(index + 1)} of ${String(length)}`}
            className={inputClassName}
            type="text"
            inputMode="numeric"
            autoComplete={autoComplete && index === 0 ? "one-time-code" : "off"}
            pattern="[0-9]"
            maxLength={length}
            required
            value={digit}
            onChange={(event) => {
              const typed = event.target.value.replace(/\D/g, "");
              if (!typed) {
                const next = [...digits];
                next[index] = "";
                onChange(next.join(""));
                return;
              }
              const next = [...digits];
              for (const [offset, char] of typed.match(/./gu)?.entries() ?? []) {
                if (index + offset < length) next[index + offset] = char;
              }
              const result = next.join("").slice(0, length);
              onChange(result);
              refs.current[Math.min(index + typed.length, length - 1)]?.focus();
            }}
            onKeyDown={(event) => {
              handleKeyDown(event, index);
            }}
            onFocus={(event) => {
              event.currentTarget.select();
            }}
          />
        ))}
      </div>
      <p id={`${id}-hint`} className="sr-only">
        Enter {length} digits. You can paste the complete code.
      </p>
    </fieldset>
  );
}
