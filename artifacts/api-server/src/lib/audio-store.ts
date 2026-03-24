import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { v4 as uuidv4 } from "uuid";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// Persistent directory (survives restarts), served as express static
export const AUDIO_DIR = path.resolve(__dirname, "..", "..", "audio");

if (!fs.existsSync(AUDIO_DIR)) fs.mkdirSync(AUDIO_DIR, { recursive: true });

export function saveAudio(buffer: Buffer): string {
  const id   = uuidv4();
  const file = path.join(AUDIO_DIR, `${id}.mp3`);
  fs.writeFileSync(file, buffer);
  // clean up files older than 10 minutes
  try {
    const now = Date.now();
    for (const f of fs.readdirSync(AUDIO_DIR)) {
      const fp = path.join(AUDIO_DIR, f);
      const stat = fs.statSync(fp);
      if (now - stat.mtimeMs > 10 * 60 * 1000) fs.unlinkSync(fp);
    }
  } catch {}
  return id;
}

export function getAudioFile(id: string): string | null {
  const file = path.join(AUDIO_DIR, `${id}.mp3`);
  return fs.existsSync(file) ? file : null;
}
