export const fmtSize = (bytes: number) => {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
};

export const fmtDate = (ms: number, locale = "en-US") =>
  new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short" }).format(ms);

export const fmtDateRange = (a: number, b: number, locale = "en-US") => {
  const start = new Date(a);
  const end = new Date(b);
  if (start.toDateString() === end.toDateString()) {
    return fmtDate(a, locale);
  }
  return `${fmtDate(a, locale)} - ${fmtDate(b, locale)}`;
};
