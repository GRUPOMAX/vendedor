// mdiff-clean.js (ESM)
import fs from "node:fs";

function processLine(line) {
  const ltrim = line.replace(/^\s+/, "");
  if (ltrim.startsWith("+++ ") || ltrim.startsWith("--- ")) {
    return line; // não mexe em cabeçalhos de diff
  }
  const m = line.match(/^(\s*)([+-])\s?(.*)$/);
  if (!m) return line;

  const [, indent, sign, rest] = m;
  if (sign === "-") return null; // remove
  return indent + rest;          // mantém sem "+"
}

function run(input) {
  const lines = input.split(/\r?\n/);
  const out = [];
  for (const line of lines) {
    const cooked = processLine(line);
    if (cooked !== null) out.push(cooked);
  }
  const endsWithNewline = /\r?\n$/.test(input);
  return out.join("\n") + (endsWithNewline ? "\n" : "");
}

// --- execução principal ---
const arg = process.argv[2];
if (arg) {
  const data = fs.readFileSync(arg, "utf8");
  process.stdout.write(run(data));
} else {
  let buf = "";
  process.stdin.setEncoding("utf8");
  process.stdin.on("data", (chunk) => (buf += chunk));
  process.stdin.on("end", () => process.stdout.write(run(buf)));
}
