const DISPLAY_DATE_FORMAT = new Intl.DateTimeFormat("en-US", {
  year: "numeric",
  month: "long",
  day: "numeric",
});

export function formatDisplayDate(date: Date): string {
  return DISPLAY_DATE_FORMAT.format(date);
}
