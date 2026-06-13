export function pad2(n) {
  return String(n).padStart(2, "0");
}

export function ymd(y, m1, d) {
  return `${y}-${pad2(m1)}-${pad2(d)}`;
}

export function monthWindow(year, month0) {
  const start = new Date(year, month0, 1);
  const end = new Date(year, month0 + 1, 0);
  return {
    from: ymd(year, month0 + 1, 1),
    to: ymd(year, month0 + 1, end.getDate()),
    daysInMonth: end.getDate(),
    firstDow: start.getDay(),
  };
}
