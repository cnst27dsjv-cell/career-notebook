export function reminderTimes(
  start: Date | null,
  deadline: Date | null,
  hours: number[],
  now = new Date(),
) {
  return [
    ...new Set(
      [start, deadline]
        .filter(Boolean)
        .flatMap((d) => hours.map((h) => d!.getTime() - h * 3600000)),
    ),
  ]
    .filter((t) => t > now.getTime())
    .sort()
    .map((t) => new Date(t));
}
export function overlaps(a: Date, b: Date, c: Date, d: Date) {
  return a < d && b > c;
}
export function suggestSlots(
  events: { start: Date | null; end: Date | null; status: string }[],
  minutes: number,
  deadline: Date,
  availability: { weekdays: number[]; weekends: number[] },
  now = new Date(),
) {
  const results: string[] = [];
  const limit = Math.min(deadline.getTime(), now.getTime() + 7 * 86400000);
  for (
    let t = Math.ceil(now.getTime() / 1800000) * 1800000;
    t + minutes * 60000 <= limit;
    t += 1800000
  ) {
    const local = new Date(t + 8 * 3600000);
    const h = local.getUTCHours() + local.getUTCMinutes() / 60;
    const range = [0, 6].includes(local.getUTCDay())
      ? availability.weekends
      : availability.weekdays;
    if (h < range[0] || h + minutes / 60 > range[1]) continue;
    if (
      events.some(
        (e) =>
          e.start &&
          e.status === "待完成" &&
          overlaps(
            new Date(t - 900000),
            new Date(t + minutes * 60000 + 900000),
            e.start,
            e.end ?? new Date(e.start.getTime() + 3600000),
          ),
      )
    )
      continue;
    results.push(new Date(t).toISOString());
    if (results.length === 3) break;
  }
  return results;
}
export function filterApplications<T extends Record<string, unknown>>(
  items: T[],
  filters: Record<string, string[]>,
  q: string,
) {
  return items.filter(
    (a) =>
      Object.entries(filters).every(
        ([k, v]) => !v.length || v.includes(String(a[k] || "未填写")),
      ) &&
      (!q || `${a.company} ${a.role}`.toLowerCase().includes(q.toLowerCase())),
  );
}

export function allReminderTimes(
  start: Date | null,
  deadline: Date | null,
  hours: number[],
  absolute: Date[],
  now = new Date(),
) {
  return [
    ...new Set(
      [
        ...reminderTimes(start, deadline, hours, now),
        ...absolute.filter((d) => d > now),
      ].map((d) => d.getTime()),
    ),
  ]
    .sort((a, b) => a - b)
    .map((t) => new Date(t));
}
