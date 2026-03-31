export function calculateDaysDiff(dateStr: string | null): number {
  if (!dateStr) return 999;
  const d = new Date(dateStr);
  const target = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
  const now = new Date();
  const today = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
  return Math.round((target - today) / 86400000);
}

export function isDateOverdue(dateStr: string | null): boolean {
  if (!dateStr) return false;
  return calculateDaysDiff(dateStr) < 0;
}

export function formatShortDateUTC(dateStr: string | null): string {
  if (!dateStr) return "";
  const d = new Date(dateStr);
  const target = new Date(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
  return target.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
}
