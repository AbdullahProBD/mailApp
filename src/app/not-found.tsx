import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = { title: "Page not found" };

export default function NotFound() {
  return (
    <main className="flex min-h-full items-center justify-center px-6 py-16">
      <div className="w-full max-w-md text-center">
        <p className="text-sm font-medium tracking-wide text-indigo-700 dark:text-indigo-300">
          404
        </p>
        <h1 className="mt-3 text-2xl font-semibold tracking-tight">This page does not exist.</h1>
        <p className="mt-3 text-stone-600 dark:text-stone-300">
          The link may be stale, or the page may never have existed.
        </p>
        <Link
          href="/"
          className="mt-8 inline-flex rounded-lg bg-stone-900 px-4 py-2 text-sm font-medium text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-stone-900 dark:bg-stone-100 dark:text-stone-900 dark:focus-visible:outline-stone-100"
        >
          Go back home
        </Link>
      </div>
    </main>
  );
}
