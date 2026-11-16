import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Welcome",
};

export default function HomePage() {
  return (
    <main className="flex min-h-full items-center justify-center bg-stone-50 px-6 py-16 text-stone-950 dark:bg-stone-950 dark:text-stone-50">
      <section className="w-full max-w-lg rounded-2xl border border-stone-200 bg-white p-8 shadow-sm dark:border-stone-800 dark:bg-stone-900 sm:p-10">
        <div
          aria-hidden="true"
          className="mb-8 flex size-12 items-center justify-center rounded-xl bg-indigo-600 text-lg font-semibold text-white"
        >
          M
        </div>
        <p className="mb-3 text-sm font-medium tracking-wide text-indigo-700 dark:text-indigo-300">
          PRIVATE MAIL
        </p>
        <h1 className="text-3xl font-semibold tracking-tight">Your inbox, on your terms.</h1>
        <p className="mt-4 leading-7 text-stone-600 dark:text-stone-300">
          A private, single-owner mail client is being prepared. Secure setup and sign-in will be
          available after the foundation is configured.
        </p>
        <div className="mt-8 rounded-xl border border-stone-200 bg-stone-50 p-4 text-sm leading-6 text-stone-700 dark:border-stone-700 dark:bg-stone-800 dark:text-stone-200">
          This application is not yet configured for production. Do not enter credentials or connect
          a mail account.
        </div>
      </section>
    </main>
  );
}
