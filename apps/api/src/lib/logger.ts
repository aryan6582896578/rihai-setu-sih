import fs from "node:fs";
import path from "node:path";
import { Writable } from "node:stream";

const logDir = path.resolve(process.cwd(), process.cwd().endsWith("apps\\api") || process.cwd().endsWith("apps/api") ? "../../logs" : "logs");
fs.mkdirSync(logDir, { recursive: true });

const logPath = path.join(logDir, "api.log");
const fileStream = fs.createWriteStream(logPath, { flags: "a" });

export const accessLogStream = new Writable({
  write(chunk, _enc, cb) {
    fileStream.write(chunk);
    process.stdout.write(chunk);
    cb();
  },
});

function line(level: string, msg: string, meta?: unknown): string {
  const base = `${new Date().toISOString()} [${level}] ${msg}`;
  if (meta === undefined) return base;
  const metaStr = typeof meta === "string" ? meta : JSON.stringify(meta);
  return `${base} ${metaStr}`;
}

function emit(level: string, msg: string, meta?: unknown): void {
  const text = line(level, msg, meta);
  // eslint-disable-next-line no-console
  console.log(text);
  fileStream.write(text + "\n");
}

export const logger = {
  info: (msg: string, meta?: unknown) => emit("info", msg, meta),
  warn: (msg: string, meta?: unknown) => emit("warn", msg, meta),
  error: (msg: string, meta?: unknown) => emit("error", msg, meta),
  debug: (msg: string, meta?: unknown) => {
    if (process.env.NODE_ENV !== "production") emit("debug", msg, meta);
  },
  logPath,
};
