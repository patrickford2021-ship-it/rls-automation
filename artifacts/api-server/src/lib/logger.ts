import pino from "pino";
import { pushLog } from "./log-buffer.js";

const isProduction = process.env.NODE_ENV === "production";

const base = pino({
  level: process.env.LOG_LEVEL ?? "info",
  redact: [
    "req.headers.authorization",
    "req.headers.cookie",
    "res.headers['set-cookie']",
  ],
  ...(isProduction
    ? {}
    : {
        transport: {
          target: "pino-pretty",
          options: { colorize: true },
        },
      }),
});

const LEVELS: Record<string, string> = { 10: "trace", 20: "debug", 30: "info", 40: "warn", 50: "error", 60: "fatal" };

function capture(level: string, objOrMsg: unknown, msg?: string) {
  const isObj = objOrMsg !== null && typeof objOrMsg === "object";
  const message = isObj ? (msg ?? "") : String(objOrMsg ?? "");
  const data    = isObj ? (objOrMsg as Record<string, unknown>) : undefined;
  pushLog({ ts: Date.now(), level, msg: message, data });
}

type LogFn = {
  (obj: object, msg?: string): void;
  (msg: string): void;
};

function wrapLevel(level: "trace" | "debug" | "info" | "warn" | "error" | "fatal"): LogFn {
  return (objOrMsg: unknown, msg?: string) => {
    // forward to pino
    if (typeof objOrMsg === "string") {
      (base[level] as (m: string) => void)(objOrMsg);
    } else {
      (base[level] as (o: object, m?: string) => void)(objOrMsg as object, msg);
    }
    capture(level, objOrMsg, msg);
  };
}

export const logger = {
  trace: wrapLevel("trace"),
  debug: wrapLevel("debug"),
  info:  wrapLevel("info"),
  warn:  wrapLevel("warn"),
  error: wrapLevel("error"),
  fatal: wrapLevel("fatal"),
  child: (bindings: Record<string, unknown>) => base.child(bindings),
};
