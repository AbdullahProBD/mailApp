import { SettingsSkeleton } from "@/components/skeletons";

export default function AccountsLoading() {
  return (
    <main className="min-h-full px-6 py-12">
      <div className="mx-auto max-w-3xl">
        <SettingsSkeleton />
      </div>
    </main>
  );
}
