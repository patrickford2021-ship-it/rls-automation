import express, { type Express } from "express";
import cors from "cors";
import pinoHttp from "pino-http";
import path from "path";
import { fileURLToPath } from "url";
import router from "./routes";
import { logger } from "./lib/logger";
import { AUDIO_DIR } from "./lib/audio-store";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const app: Express = express();

// ── Public static audio files — MUST be first, no auth, Twilio fetches these ──
app.use("/audio", express.static(AUDIO_DIR, {
  setHeaders: (res) => {
    res.set("Access-Control-Allow-Origin", "*");
    res.set("Cache-Control", "no-cache");
    res.set("Content-Type", "audio/mpeg");
  },
}));

// ── Logging & parsing middleware ──
app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return { id: req.id, method: req.method, url: req.url?.split("?")[0] };
      },
      res(res) {
        return { statusCode: res.statusCode };
      },
    },
  }),
);
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use("/api", router);

export default app;
