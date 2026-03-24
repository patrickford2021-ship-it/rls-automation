import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dirname, "..", "..", "data");

if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

export const FILES = {
  queue:       path.join(DATA_DIR, "queue.json"),
  transcripts: path.join(DATA_DIR, "transcripts.json"),
  learnings:   path.join(DATA_DIR, "learnings.json"),
  stats:       path.join(DATA_DIR, "stats.json"),
  training:    path.join(DATA_DIR, "training.json"),
  system:      path.join(DATA_DIR, "system.json"),
  callbacks:   path.join(DATA_DIR, "callbacks.json"),
};

export function readJson<T>(file: string, fallback: T): T {
  try {
    if (fs.existsSync(file)) return JSON.parse(fs.readFileSync(file, "utf8")) as T;
  } catch {}
  return fallback;
}

export function writeJson(file: string, data: unknown): void {
  fs.writeFileSync(file, JSON.stringify(data, null, 2), "utf8");
}

export interface SystemState {
  sarahEnabled: boolean;
  sarahPausedAt: string | null;
}

export interface Stats {
  totalCalls: number;
  transfers: number;
  rickTransfers: number;
  vedderTransfers: number;
  noAnswers: number;
  voicemails: number;
  hangups: number;
  nextTransferTo: "rick" | "vedder";
}

export interface QueueItem {
  id: string;
  name: string;
  phone: string;
  status: "pending" | "calling" | "completed" | "failed";
  callSid?: string;
  startedAt?: string;
  error?: string;
}

export interface QueueState {
  items: QueueItem[];
  active: boolean;
  currentIndex: number;
  paused: boolean;
}

export interface TranscriptLine {
  speaker: string;
  text: string;
  time: string;
}

export interface Transcript {
  id: string;
  businessName: string;
  outcome: string;
  transferredTo?: string;
  transcript: TranscriptLine[];
  duration?: number;
  createdAt: string;
}

export interface Learnings {
  insights: string[];
  lastUpdated: string | null;
  totalAnalyzed: number;
}

export interface TrainingVideo {
  videoId: string;
  title: string;
  channel: string;
  url: string;
  addedAt: string;
  techniques: string[];
}

export interface Training {
  videos: TrainingVideo[];
  techniques: string[];
  lastUpdated: string | null;
}

export interface Callback {
  id: string;
  businessName: string;
  phone: string;
  requestedTime: string;
  repName: string;
  createdAt: string;
  status: string;
}

export function getSystem(): SystemState {
  return readJson(FILES.system, { sarahEnabled: true, sarahPausedAt: null });
}
export function saveSystem(s: SystemState): void { writeJson(FILES.system, s); }

export function getStats(): Stats {
  return readJson(FILES.stats, {
    totalCalls: 0, transfers: 0,
    rickTransfers: 0, vedderTransfers: 0,
    noAnswers: 0, voicemails: 0, hangups: 0,
    nextTransferTo: "rick" as const,
  });
}
export function saveStats(s: Stats): void { writeJson(FILES.stats, s); }

export function getQueue(): QueueState {
  return readJson(FILES.queue, { items: [], active: false, currentIndex: 0, paused: false });
}
export function saveQueue(q: QueueState): void { writeJson(FILES.queue, q); }

export function saveTranscript(t: Transcript): void {
  const all = readJson<Transcript[]>(FILES.transcripts, []);
  all.unshift(t);
  writeJson(FILES.transcripts, all.slice(0, 200));
}
export function getTranscripts(): Transcript[] {
  return readJson<Transcript[]>(FILES.transcripts, []);
}

export function getLearnings(): Learnings {
  return readJson(FILES.learnings, { insights: [], lastUpdated: null, totalAnalyzed: 0 });
}
export function saveLearnings(l: Learnings): void { writeJson(FILES.learnings, l); }

export function getTraining(): Training {
  return readJson(FILES.training, { videos: [], techniques: [], lastUpdated: null });
}
export function saveTraining(t: Training): void { writeJson(FILES.training, t); }

export function getCallbacks(): Callback[] {
  return readJson<Callback[]>(FILES.callbacks, []);
}
export function saveCallbacks(c: Callback[]): void { writeJson(FILES.callbacks, c); }
