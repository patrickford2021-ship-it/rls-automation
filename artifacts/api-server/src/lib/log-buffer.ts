/**
 * In-memory circular log buffer — stores the last 500 log lines
 * so the dashboard can poll them for live display.
 */

export interface LogEntry {
  ts: number;
  level: string;
  msg: string;
  data?: Record<string, unknown>;
}

const MAX = 500;
const buffer: LogEntry[] = [];

export function pushLog(entry: LogEntry): void {
  buffer.push(entry);
  if (buffer.length > MAX) buffer.shift();
}

export function getLogs(since?: number): LogEntry[] {
  if (!since) return buffer.slice(-100);
  return buffer.filter(e => e.ts > since);
}
