import type { SortingState } from "@tanstack/react-table";
import type { FileEntry } from "./types";
const collator = new Intl.Collator("en", {
  numeric: true,
  sensitivity: "variant",
});
export function orderEntries(
  entries: FileEntry[],
  sorting: SortingState,
): FileEntry[] {
  const key = sorting[0]?.id ?? "originalName";
  const desc = sorting[0]?.desc ?? false;
  const value = (e: FileEntry) =>
    key === "kind" ? e.kind : key === "originalPath" ? e.path : e.name;
  return [...entries].sort(
    (a, b) =>
      (collator.compare(value(a), value(b)) ||
        collator.compare(a.path, b.path)) * (desc ? -1 : 1),
  );
}
