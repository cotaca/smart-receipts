import { ApiStatus } from "@/components/api-status";

export default function Home() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-4 bg-zinc-50 dark:bg-black">
      <h1 className="text-2xl font-semibold text-zinc-950 dark:text-zinc-50">
        SmartReceipts
      </h1>
      <ApiStatus />
    </div>
  );
}
