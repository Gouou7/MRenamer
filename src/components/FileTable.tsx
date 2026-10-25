import { useMemo, useRef } from "react";
import {
  flexRender,
  useReactTable,
  getCoreRowModel,
  type ColumnDef,
  type SortingState,
  type OnChangeFn,
} from "@tanstack/react-table";
import { useVirtualizer } from "@tanstack/react-virtual";
import { useTranslation } from "react-i18next";
import {
  File,
  Folder,
  Link,
  ArrowDownUp,
  Check,
  TriangleAlert,
  Minus,
} from "lucide-react";
import {
  Table,
  TableHeader,
  TableHead,
  TableRow,
  TableBody,
  TableCell,
} from "@/components/ui/table";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import type { PreviewRow } from "@/lib/types";
export function FileTable({
  rows,
  selected,
  onSelected,
  disabled,
  sorting,
  onSorting,
}: {
  rows: PreviewRow[];
  selected: Set<string>;
  onSelected: (s: Set<string>) => void;
  disabled: boolean;
  sorting: SortingState;
  onSorting: OnChangeFn<SortingState>;
}) {
  const { t } = useTranslation();
  const scroll = useRef<HTMLDivElement>(null);
  const columns = useMemo<ColumnDef<PreviewRow>[]>(
    () => [
      {
        id: "selected",
        size: 46,
        enableSorting: false,
        header: () => (
          <Checkbox
            aria-label={t("selectAll")}
            disabled={disabled}
            checked={
              rows.length > 0 &&
              rows
                .filter((r) => r.kind !== "link" && r.kind !== "unsupported")
                .every((r) => selected.has(r.id))
            }
            onCheckedChange={(value) => {
              const set = new Set(selected);
              rows
                .filter((r) => r.kind !== "link" && r.kind !== "unsupported")
                .forEach((r) => (value ? set.add(r.id) : set.delete(r.id)));
              onSelected(set);
            }}
          />
        ),
        cell: ({ row }) => (
          <Checkbox
            aria-label={t("selectRow")}
            disabled={
              disabled ||
              row.original.kind === "link" ||
              row.original.kind === "unsupported"
            }
            checked={selected.has(row.original.id)}
            onCheckedChange={(value) => {
              const set = new Set(selected);
              value ? set.add(row.original.id) : set.delete(row.original.id);
              onSelected(set);
            }}
          />
        ),
      },
      {
        accessorKey: "kind",
        header: t("kind"),
        size: 84,
        cell: ({ getValue }) => {
          const value = getValue<string>();
          const Icon =
            value === "directory" ? Folder : value === "file" ? File : Link;
          return (
            <span className="type-cell">
              <Icon />
              {t(value)}
            </span>
          );
        },
      },
      { accessorKey: "originalName", header: t("originalName"), size: 250 },
      {
        accessorKey: "newName",
        header: t("newName"),
        size: 270,
        enableSorting: false,
        cell: ({ row }) => (
          <span
            className={
              row.original.status === "changed" ? "changed-name" : undefined
            }
          >
            {row.original.newName}
          </span>
        ),
      },
      {
        accessorKey: "status",
        header: t("status"),
        size: 190,
        enableSorting: false,
        cell: ({ row }) => {
          const r = row.original;
          const Icon = r.error
            ? TriangleAlert
            : r.status === "changed"
              ? Check
              : Minus;
          return (
            <Badge variant={r.error ? "destructive" : "secondary"}>
              <Icon data-icon="inline-start" />
              {r.error ? t(`errors.${r.error}`) : t(r.status)}
            </Badge>
          );
        },
      },
      { accessorKey: "originalPath", header: t("originalPath"), size: 330 },
      {
        accessorKey: "targetPath",
        header: t("targetPath"),
        size: 330,
        enableSorting: false,
      },
    ],
    [t, selected, onSelected, rows, disabled],
  );
  const table = useReactTable({
    data: rows,
    columns,
    getCoreRowModel: getCoreRowModel(),
    manualSorting: true,
    state: { sorting },
    onSortingChange: onSorting,
    columnResizeMode: "onChange",
    defaultColumn: { minSize: 40 },
    enableSortingRemoval: false,
  });
  const virtual = useVirtualizer({
    count: rows.length,
    getScrollElement: () => scroll.current,
    estimateSize: () => 26,
    overscan: 12,
  });
  return (
    <div className="file-scroll" ref={scroll} data-testid="file-scroll">
      <Table className="file-table" style={{ width: table.getTotalSize() }}>
        <TableHeader>
          {table.getHeaderGroups().map((group) => (
            <TableRow key={group.id}>
              {group.headers.map((h) => (
                <TableHead key={h.id} style={{ width: h.getSize() }}>
                  <div className="flex w-full items-center gap-2">
                    {h.column.getCanSort() ? (
                      <button
                        className="column-sort"
                        onClick={h.column.getToggleSortingHandler()}
                      >
                        {flexRender(h.column.columnDef.header, h.getContext())}
                        <ArrowDownUp />
                      </button>
                    ) : (
                      flexRender(h.column.columnDef.header, h.getContext())
                    )}
                  </div>
                  {h.column.getCanResize() && (
                    <div
                      role="separator"
                      aria-label={String(h.column.columnDef.header)}
                      aria-orientation="vertical"
                      className="column-resizer"
                      onMouseDown={h.getResizeHandler()}
                      onTouchStart={h.getResizeHandler()}
                    />
                  )}
                </TableHead>
              ))}
            </TableRow>
          ))}
        </TableHeader>
        <TableBody style={{ height: virtual.getTotalSize() }}>
          {virtual.getVirtualItems().map((item) => {
            const row = table.getRowModel().rows[item.index];
            return (
              <TableRow
                key={row.id}
                data-selected={selected.has(row.original.id)}
                style={{
                  height: item.size,
                  transform: `translateY(${item.start}px)`,
                }}
              >
                {row.getVisibleCells().map((cell) => (
                  <TableCell
                    key={cell.id}
                    style={{ width: cell.column.getSize() }}
                    title={
                      typeof cell.getValue() === "string"
                        ? cell.getValue<string>()
                        : undefined
                    }
                  >
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                  </TableCell>
                ))}
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}
