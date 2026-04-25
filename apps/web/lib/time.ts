export function getLocalDate(timezone: string, date = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);

  const year = parts.find((part) => part.type === "year")?.value;
  const month = parts.find((part) => part.type === "month")?.value;
  const day = parts.find((part) => part.type === "day")?.value;

  if (!year || !month || !day) {
    throw new Error(`Unable to resolve local date for timezone ${timezone}`);
  }

  return `${year}-${month}-${day}`;
}

export function addDays(date: string, days: number): string {
  const parsed = new Date(`${date}T00:00:00.000Z`);
  parsed.setUTCDate(parsed.getUTCDate() + days);
  return parsed.toISOString().slice(0, 10);
}

export function formatItalianDate(date: string): string {
  const [year, month, day] = date.split("-");
  if (!year || !month || !day) {
    throw new Error("Invalid ISO date");
  }
  return `${day}/${month}/${year}`;
}

export function assertIsoDate(input: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input)) {
    throw new Error("Invalid ISO date");
  }

  const date = new Date(`${input}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== input) {
    throw new Error("Invalid ISO date");
  }

  return input;
}

export function assertIsoTime(input: string): string {
  if (!/^\d{2}:\d{2}$/.test(input)) {
    throw new Error("Invalid ISO time");
  }

  const [hoursRaw, minutesRaw] = input.split(":");
  const hours = Number(hoursRaw);
  const minutes = Number(minutesRaw);
  if (!Number.isInteger(hours) || !Number.isInteger(minutes) || hours < 0 || hours > 23 || minutes < 0 || minutes > 59) {
    throw new Error("Invalid ISO time");
  }

  return `${hoursRaw}:${minutesRaw}:00`;
}

export function scheduledReminderTimestamp(date: string): string {
  return `${date}T08:00:00.000Z`;
}
