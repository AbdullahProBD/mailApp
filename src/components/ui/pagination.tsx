import { Icon } from "@/components/icons/icon";
import { buildPageRange } from "@/lib/utils/pagination";
import { cn } from "@/lib/utils/cn";

export interface PaginationProps {
  page: number;
  pageCount: number;
  onPageChange: (page: number) => void;
  /** Number of page buttons to show either side of the current page. */
  siblingCount?: number;
  className?: string;
}

export function Pagination({
  page,
  pageCount,
  onPageChange,
  siblingCount = 1,
  className,
}: PaginationProps) {
  const safeCount = Math.max(1, pageCount);
  const pages = buildPageRange(page, safeCount, siblingCount);
  const buttonBase =
    "inline-flex size-[var(--control-h-sm)] items-center justify-center rounded-md text-sm transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ring)] disabled:cursor-not-allowed disabled:opacity-40";

  return (
    <nav aria-label="Pagination" className={cn("flex items-center gap-1", className)}>
      <button
        type="button"
        aria-label="Previous page"
        disabled={page <= 1}
        onClick={() => {
          onPageChange(page - 1);
        }}
        className={cn(buttonBase, "text-muted-foreground hover:bg-surface-2 hover:text-foreground")}
      >
        <Icon name="chevron-left" size={16} />
      </button>
      {pages.map((entry, index) =>
        entry === "ellipsis" ? (
          <span
            key={`ellipsis-${String(index)}`}
            aria-hidden="true"
            className="px-1.5 text-sm text-muted-foreground"
          >
            …
          </span>
        ) : (
          <button
            key={entry}
            type="button"
            aria-label={`Page ${String(entry)}`}
            aria-current={entry === page ? "page" : undefined}
            onClick={() => {
              onPageChange(entry);
            }}
            className={cn(
              buttonBase,
              entry === page
                ? "bg-accent text-accent-foreground"
                : "text-muted-foreground hover:bg-surface-2 hover:text-foreground",
            )}
          >
            {entry}
          </button>
        ),
      )}
      <button
        type="button"
        aria-label="Next page"
        disabled={page >= safeCount}
        onClick={() => {
          onPageChange(page + 1);
        }}
        className={cn(buttonBase, "text-muted-foreground hover:bg-surface-2 hover:text-foreground")}
      >
        <Icon name="chevron-right" size={16} />
      </button>
    </nav>
  );
}
