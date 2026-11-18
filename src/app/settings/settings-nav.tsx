import Link from "next/link";

import { cn } from "@/lib/utils/cn";

export type SettingsSection = "security" | "accounts";

const SECTIONS: ReadonlyArray<{ id: SettingsSection; href: string; label: string }> = [
  { id: "security", href: "/settings", label: "Security" },
  { id: "accounts", href: "/settings/accounts", label: "Accounts" },
];

/** Shared settings navigation. Add a section here when its page ships. */
export function SettingsNav({ active }: { active: SettingsSection }) {
  return (
    <nav aria-label="Settings" className="mt-6 flex gap-1 overflow-x-auto border-b border-border">
      {SECTIONS.map((section) => (
        <Link
          key={section.id}
          href={section.href}
          aria-current={active === section.id ? "page" : undefined}
          className={cn(
            "-mb-px whitespace-nowrap border-b-2 px-3 py-2 text-sm font-medium transition-colors",
            "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ring)]",
            active === section.id
              ? "border-accent text-foreground"
              : "border-transparent text-muted-foreground hover:border-border-strong hover:text-foreground",
          )}
        >
          {section.label}
        </Link>
      ))}
    </nav>
  );
}
