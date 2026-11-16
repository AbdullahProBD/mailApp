"use client";

import { useEffect } from "react";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // The digest is a correlation token, not the exception message or its data.
    if (error.digest) {
      document.documentElement.dataset.errorDigest = error.digest;
    }
  }, [error.digest]);

  return (
    <html lang="en">
      <body className="flex min-h-screen items-center justify-center bg-stone-50 px-6 text-stone-950 dark:bg-stone-950 dark:text-stone-50">
        <main className="w-full max-w-md rounded-2xl border border-stone-200 bg-white p-8 shadow-sm dark:border-stone-800 dark:bg-stone-900">
          <p className="text-sm font-medium text-rose-700 dark:text-rose-300">
            Something went wrong
          </p>
          <h1 className="mt-2 text-2xl font-semibold tracking-tight">
            We couldn’t load this page.
          </h1>
          <p className="mt-3 text-stone-600 dark:text-stone-300">
            No sensitive details are shown here. You can try loading the page again.
          </p>
          <button
            type="button"
            onClick={reset}
            className="mt-7 rounded-lg bg-stone-900 px-4 py-2 text-sm font-medium text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-stone-900 dark:bg-stone-100 dark:text-stone-900 dark:focus-visible:outline-stone-100"
          >
            Try again
          </button>
        </main>
      </body>
    </html>
  );
}
