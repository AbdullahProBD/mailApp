import type { InputHTMLAttributes } from "react";

import { cn } from "@/lib/utils/cn";

export type SliderProps = Omit<InputHTMLAttributes<HTMLInputElement>, "type">;

export function Slider({ className, ...props }: SliderProps) {
  return (
    <input
      type="range"
      className={cn(
        "h-[var(--control-h-md)] w-full cursor-pointer appearance-none bg-transparent outline-none",
        "[&::-webkit-slider-runnable-track]:h-1.5 [&::-webkit-slider-runnable-track]:rounded-full [&::-webkit-slider-runnable-track]:bg-surface-3",
        "[&::-moz-range-track]:h-1.5 [&::-moz-range-track]:rounded-full [&::-moz-range-track]:bg-surface-3",
        "[&::-webkit-slider-thumb]:mt-[-0.3125rem] [&::-webkit-slider-thumb]:size-[1.125rem] [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:border [&::-webkit-slider-thumb]:border-border [&::-webkit-slider-thumb]:bg-accent [&::-webkit-slider-thumb]:shadow-sm",
        "[&::-moz-range-thumb]:size-[1.125rem] [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:border [&::-moz-range-thumb]:border-border [&::-moz-range-thumb]:bg-accent",
        "focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[var(--ring)]",
        "disabled:cursor-not-allowed disabled:opacity-55",
        className,
      )}
      {...props}
    />
  );
}
