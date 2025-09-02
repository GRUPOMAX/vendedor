// src/components/vendedor/probabilidade/utils/dayjs.js
import dayjs from "dayjs";
import customParseFormat from "dayjs/plugin/customParseFormat";
dayjs.extend(customParseFormat);

export const FMT = [
  "DD/MM/YYYY, HH:mm:ss",
  "DD/MM/YYYY HH:mm:ss",
  "DD/MM/YYYY - HH:mm:ss",
  "YYYY-MM-DDTHH:mm:ssZ",
  "YYYY-MM-DD",
];

export default dayjs;
