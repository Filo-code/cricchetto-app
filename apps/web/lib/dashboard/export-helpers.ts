import "server-only";

export function csvCell(value: string): string {
  const str = String(value ?? "").replace(/"/g, '""');
  return /[",\n\r]/.test(str) ? `"${str}"` : str;
}

export function csvRow(cells: string[]): string {
  return cells.map(csvCell).join(",");
}

export function csvHeader(columns: string[]): string {
  return csvRow(columns);
}

export function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}
