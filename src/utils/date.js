import dayjs from "dayjs";

export const fmt = (d) => dayjs(d).format("YYYY-MM-DD");
export const startOfMonth = () => dayjs().startOf("month").format("YYYY-MM-DD");
export const today = () => dayjs().format("YYYY-MM-DD");


export const pad2 = (n) => String(n).padStart(2, "0");

export function formatDateKey(d = new Date()) {
  const dd = pad2(d.getDate());
  const mm = pad2(d.getMonth() + 1);
  const yyyy = d.getFullYear();
  return `${dd}-${mm}-${yyyy}`; // dd-MM-yyyy
}

export function todayISO() {
  const d = new Date();
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

export function addDaysISO(days = 0) {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}
