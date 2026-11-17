import { cn } from "@/lib/utils/cn";

export type AvatarSize = "xs" | "sm" | "md" | "lg";

const SIZES: Record<AvatarSize, string> = {
  xs: "size-6 text-2xs",
  sm: "size-8 text-xs",
  md: "size-10 text-sm",
  lg: "size-12 text-base",
};

/** Derives up to two initials from a name or email address. */
export function initialsFor(value: string): string {
  const cleaned = value.trim();
  if (!cleaned) return "?";
  const at = cleaned.indexOf("@");
  const local = at > 0 ? cleaned.slice(0, at) : cleaned;
  const parts = local.split(/[\s._-]+/u).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return (parts[0] ?? "").slice(0, 2).toUpperCase();
  return `${(parts[0] ?? "").charAt(0)}${(parts[1] ?? "").charAt(0)}`.toUpperCase();
}

export interface AvatarProps {
  /** Name or email used for the initials and the accessible label. */
  name: string;
  /** Optional image URL; falls back to initials when absent. */
  src?: string;
  size?: AvatarSize;
  className?: string;
}

export function Avatar({ name, src, size = "md", className }: AvatarProps) {
  return (
    <span
      role="img"
      aria-label={name}
      className={cn(
        "inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-accent-soft font-semibold text-accent-soft-foreground",
        SIZES[size],
        className,
      )}
    >
      {src ? (
        // The source is an owner-supplied avatar; a plain img is intentional so
        // any URL works and no remote-pattern config is required.
        // eslint-disable-next-line @next/next/no-img-element
        <img src={src} alt="" className="size-full object-cover" />
      ) : (
        <span aria-hidden="true">{initialsFor(name)}</span>
      )}
    </span>
  );
}
