import axios from "axios";
import { type Request } from "express";
import { logger } from "./logger.js";
import { saveAudio } from "./audio-store.js";

const VOICE_ID = "cgSgspJ2msm6clMCkdW9";

/**
 * Builds the public audio URL Twilio will fetch.
 * Uses REPLIT_DEV_DOMAIN if available, falls back to the request host.
 */
export function getAudioUrl(audioId: string, req: Request): string {
  const host = process.env.REPLIT_DEV_DOMAIN || req.get("host") || "localhost";
  return `https://${host}/audio/${audioId}.mp3`;
}

/**
 * Calls ElevenLabs TTS, saves to disk, and returns the public HTTPS URL
 * that Twilio can fetch directly.  Returns null on failure (falls back to Polly).
 */
export async function sarahSpeak(text: string, req: Request): Promise<string | null> {
  try {
    const cleanText = text
      .replace(/\.\.\./g, " ")
      .replace(/—/g, ", ")
      .replace(/[<>]/g, "")
      .trim();

    if (!cleanText) return null;

    logger.info({ chars: cleanText.length }, "Calling ElevenLabs");

    const response = await axios.post(
      `https://api.elevenlabs.io/v1/text-to-speech/${VOICE_ID}`,
      {
        text: cleanText,
        model_id: "eleven_turbo_v2",
        voice_settings: {
          stability: 0.35,
          similarity_boost: 0.82,
          style: 0.45,
          use_speaker_boost: true,
        },
      },
      {
        headers: {
          "xi-api-key": process.env.ELEVENLABS_API_KEY || "",
          "Content-Type": "application/json",
          "Accept": "audio/mpeg",
        },
        responseType: "arraybuffer",
        timeout: 20000,
      }
    );

    const buffer = Buffer.from(response.data as ArrayBuffer);
    if (!buffer || buffer.byteLength < 100) {
      logger.warn("ElevenLabs returned empty audio");
      return null;
    }

    const id  = saveAudio(buffer);
    const url = getAudioUrl(id, req);
    logger.info({ bytes: buffer.byteLength, url }, "ElevenLabs audio ready");
    return url;

  } catch (err) {
    const e = err as { response?: { status?: number; data?: Buffer }; message?: string };
    const detail = e.response?.data
      ? Buffer.from(e.response.data).toString("utf8").substring(0, 300)
      : e.message;
    logger.error({ status: e.response?.status, detail }, "ElevenLabs failed — Polly fallback");
    return null;
  }
}

/**
 * Builds TwiML that plays an ElevenLabs audio URL (or falls back to Polly <Say>).
 * audioUrl is the full HTTPS URL returned by sarahSpeak, or null for Polly.
 */
export function buildTwimlWithAudio(
  audioUrl: string | null,
  gatherAction: string,
  fallbackText: string
): string {
  const safe = (fallbackText || "")
    .replace(/\.\.\./g, " ")
    .replace(/—/g, ", ")
    .replace(/[<>&'"]/g, "")
    .substring(0, 300);

  if (audioUrl) {
    return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Play>${audioUrl}</Play>
  <Gather input="speech" timeout="5" speechTimeout="2" action="${gatherAction}" method="POST">
    <Say> </Say>
  </Gather>
  <Redirect method="POST">${gatherAction}</Redirect>
</Response>`;
  }

  return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Gather input="speech" timeout="5" speechTimeout="2" action="${gatherAction}" method="POST">
    <Say voice="Polly.Joanna-Neural" rate="92%">${safe}</Say>
  </Gather>
  <Redirect method="POST">${gatherAction}</Redirect>
</Response>`;
}

/** Builds a hangup TwiML with optional spoken goodbye. */
export function buildHangupTwiml(audioUrl: string | null, fallbackText: string): string {
  const safe = (fallbackText || "")
    .replace(/\.\.\./g, " ")
    .replace(/—/g, ", ")
    .replace(/[<>&'"]/g, "")
    .substring(0, 300);

  if (audioUrl) {
    return `<?xml version="1.0" encoding="UTF-8"?><Response><Play>${audioUrl}</Play><Hangup/></Response>`;
  }
  return `<?xml version="1.0" encoding="UTF-8"?><Response><Say voice="Polly.Joanna-Neural">${safe}</Say><Hangup/></Response>`;
}
