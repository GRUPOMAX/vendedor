import axios from "axios";

const ENV = import.meta.env;
const BASE = (ENV.VITE_NOCODB_URL || "").replace(/\/$/, "");
const TOKEN = ENV.VITE_NOCODB_TOKEN;

export const nc = axios.create({
  baseURL: `${BASE}/api/v2`,
  headers: { "xc-token": TOKEN },
});

export const q = (params = {}) =>
  Object.entries(params)
    .filter(([, v]) => v !== undefined && v !== null && v !== "")
    .map(([k, v]) => Array.isArray(v)
      ? v.map(x => `${k}[]=${encodeURIComponent(x)}`).join("&")
      : `${k}=${encodeURIComponent(v)}`)
    .join("&");
