import { redirect } from "next/navigation";

// Transition until the landing page: "/" forwards to the receipts list and
// keeps the query, so old links like `/?receipt=<id>` still open the detail.
export default async function Home({ searchParams }: PageProps<"/">) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(await searchParams)) {
    for (const v of Array.isArray(value)
      ? value
      : value === undefined
        ? []
        : [value]) {
      params.append(key, v);
    }
  }
  const query = params.toString();
  redirect(query ? `/receipts?${query}` : "/receipts");
}
