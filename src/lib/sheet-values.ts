import type { SheetCell } from "@/lib/xlsx-lite";

export function blankRow(row: SheetCell[]) {
  return row.every((cell) => !cell.text.trim() && cell.number == null);
}

export function columnKeyForHeader<Key extends string>(
  text: string,
  aliases: Record<string, Key>,
) {
  const normalized = text
    .trim()
    .toLowerCase()
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ");
  return aliases[normalized] ?? null;
}

export function cellText(cell: SheetCell | undefined) {
  return cell?.text.trim() ?? "";
}

export function parseSheetCount(cell: SheetCell | undefined) {
  if (!cell || (!cell.text.trim() && cell.number == null)) {
    return null;
  }

  const value =
    cell.number != null && cell.text === "" ? cell.number : Number(cell.text.replaceAll(",", "").trim());
  if (!Number.isFinite(value) || value < 0 || !Number.isInteger(value)) {
    return null;
  }

  return value;
}
