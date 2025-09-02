// utils/dateRange.ts (ou onde preferir)
import dayjs from "@/utils/dayjs"; // com customParseFormat habilitado

export const parseAnyDate = (v) => {
  if (!v) return null;
  if (v instanceof Date && !isNaN(+v)) return dayjs(v);
  if (typeof v === "number") return dayjs(v);
  const s = String(v).trim();
  const fmts = [
    "DD/MM/YYYY, HH:mm:ss",
    "DD/MM/YYYY HH:mm:ss",
    "DD/MM/YYYY",
    "YYYY-MM-DDTHH:mm:ss.SSSZ",
    "YYYY-MM-DDTHH:mm:ssZ",
    "YYYY-MM-DD HH:mm:ss",
    "YYYY-MM-DD",
  ];
  for (const f of fmts) {
    const d = dayjs(s, f, true);
    if (d.isValid()) return d;
  }
  const d2 = dayjs(s);
  return d2.isValid() ? d2 : null;
};

export const withinRangeLocal = (dtRaw, deYmd, ateYmd) => {
  const d = parseAnyDate(dtRaw);
  if (!d) return false;
  const start = dayjs(deYmd, "YYYY-MM-DD").startOf("day");
  const end   = dayjs(ateYmd, "YYYY-MM-DD").endOf("day");
  // inclusivo nos limites
  return d.isBetween(start, end, null, "[]");
};
