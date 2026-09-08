"use client";

import * as React from "react";
import { ChevronDown } from "lucide-react";

import { cn } from "@/lib/utils";

export interface NativeSelectOption {
  value: string;
  label: React.ReactNode;
  disabled?: boolean;
}

interface NativeSelectProps extends Omit<
  React.ComponentPropsWithoutRef<"select">,
  "children" | "className" | "onChange" | "value"
> {
  value: string;
  options: NativeSelectOption[];
  onValueChange: (value: string) => void;
  className?: string;
}

/**
 * A real platform select keeps Android WebView selection on the native,
 * well-tested form-control path. Radix Select's pointer-positioning loop can
 * lock the WebView renderer on some Android versions, leaving the whole app
 * unresponsive until it is restarted.
 */
export const NativeSelect = React.forwardRef<HTMLSelectElement, NativeSelectProps>(
  ({ value, options, onValueChange, className, disabled, ...props }, ref) => (
    <div className={cn("relative h-11 w-full", className)}>
      <select
        ref={ref}
        value={value}
        disabled={disabled}
        onChange={(event) => onValueChange(event.target.value)}
        className="h-full w-full cursor-pointer appearance-none rounded-xl border border-input bg-transparent px-3 pr-9 text-sm shadow-sm outline-none ring-offset-background focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
        {...props}
      >
        {options.map((option) => (
          <option key={option.value} value={option.value} disabled={option.disabled}>
            {option.label}
          </option>
        ))}
      </select>
      <ChevronDown
        className="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 opacity-50"
        aria-hidden="true"
      />
    </div>
  ),
);
NativeSelect.displayName = "NativeSelect";
