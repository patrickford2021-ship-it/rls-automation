import { Router, type IRouter, type Request, type Response } from "express";
import { v4 as uuidv4 } from "uuid";
import {
  getStats, saveStats, getQueue, saveQueue, getTranscripts,
  getLearnings, getTraining, saveTraining, getCallbacks,
  getSystem, saveSystem, QueueItem,
} from "../lib/store.js";
import { getTwilioClient, CONFIG, runFollowUpTexter, getTodaysFollowUps } from "../lib/twilio-service.js";
import { fetchYouTubeTranscript, extractSalesTechniques } from "../lib/sarah.js";
import { processNextInQueue } from "../lib/queue-processor.js";

const router: IRouter = Router();

router.get("/stats", (_req: Request, res: Response) => {
  res.json(getStats());
});

router.post("/call", async (req: Request, res: Response) => {
  const { phone, businessName } = req.body as { phone: string; businessName: string };
  if (!phone || !businessName) {
    return void res.json({ success: false, error: "phone and businessName required" });
  }
  try {
    const host = process.env.REPLIT_DEV_DOMAIN || req.get("host") || "";
    const baseUrl = `https://${host}`;
    const stats = getStats();
    stats.totalCalls++;
    saveStats(stats);

    const call = await getTwilioClient().calls.create({
      to: phone,
      from: CONFIG.twilioPhone(),
      url: `${baseUrl}/api/voice/start?business=${encodeURIComponent(businessName)}`,
      timeout: 30,
      machineDetection: "DetectMessageEnd",
      asyncAmdStatusCallback: `${baseUrl}/api/voice/amd?business=${encodeURIComponent(businessName)}`,
    });
    res.json({ success: true, callSid: call.sid });
  } catch (err) {
    res.json({ success: false, error: (err as Error).message });
  }
});

router.get("/queue", (_req: Request, res: Response) => {
  const queue = getQueue();
  const completed = queue.items.filter(i => i.status === "completed").length;
  const failed    = queue.items.filter(i => i.status === "failed").length;
  res.json({ ...queue, completed, failed });
});

router.post("/queue/add", (req: Request, res: Response) => {
  const { leads } = req.body as { leads: Array<{ name: string; phone: string }> };
  if (!leads || !leads.length) {
    return void res.json({ success: false, error: "leads array required" });
  }
  const queue = getQueue();
  const newItems: QueueItem[] = leads.filter(l => l.phone).map(l => ({
    id: uuidv4(), name: l.name || "Unknown", phone: l.phone, status: "pending",
  }));
  queue.items.push(...newItems);
  saveQueue(queue);
  res.json({ success: true, added: newItems.length });
});

router.post("/queue/start", (req: Request, res: Response) => {
  const queue = getQueue();
  if (!queue.items.length) {
    return void res.json({ success: false, error: "Queue is empty" });
  }
  queue.active = true;
  queue.paused = false;
  if (queue.currentIndex >= queue.items.length) queue.currentIndex = 0;
  saveQueue(queue);

  const protocol = (req.headers["x-forwarded-proto"] || "https") as string;
  const host = req.get("host") || "";
  setTimeout(() => processNextInQueue(host, protocol), 500);
  res.json({ success: true });
});

router.post("/queue/pause", (_req: Request, res: Response) => {
  const queue = getQueue();
  queue.paused = true;
  saveQueue(queue);
  res.json({ success: true });
});

router.post("/queue/resume", (req: Request, res: Response) => {
  const queue = getQueue();
  queue.paused = false;
  saveQueue(queue);
  const protocol = (req.headers["x-forwarded-proto"] || "https") as string;
  const host = req.get("host") || "";
  setTimeout(() => processNextInQueue(host, protocol), 500);
  res.json({ success: true });
});

router.post("/queue/clear", (_req: Request, res: Response) => {
  saveQueue({ items: [], active: false, currentIndex: 0, paused: false });
  res.json({ success: true });
});

router.get("/transcripts", (_req: Request, res: Response) => {
  res.json(getTranscripts());
});

router.get("/learnings", (_req: Request, res: Response) => {
  res.json(getLearnings());
});

router.get("/training", (_req: Request, res: Response) => {
  res.json(getTraining());
});

router.post("/training/add", async (req: Request, res: Response) => {
  const { url } = req.body as { url: string };
  if (!url) return void res.json({ success: false, error: "url required" });
  try {
    const videoInfo = await fetchYouTubeTranscript(url);
    const techniques = await extractSalesTechniques(videoInfo);

    const training = getTraining();
    training.videos.push({
      videoId: videoInfo.videoId, title: videoInfo.title,
      channel: videoInfo.channel, url: videoInfo.url,
      addedAt: new Date().toISOString(), techniques,
    });
    training.techniques = [...new Set([...techniques, ...training.techniques])];
    training.lastUpdated = new Date().toISOString();
    saveTraining(training);

    res.json({ success: true, title: videoInfo.title, techniques });
  } catch (err) {
    res.json({ success: false, error: (err as Error).message });
  }
});

router.get("/sarah/status", (_req: Request, res: Response) => {
  const system = getSystem();
  res.json({ ...system, enabled: system.sarahEnabled });
});

router.post("/sarah/enable", (_req: Request, res: Response) => {
  const system = getSystem();
  system.sarahEnabled = true;
  system.sarahPausedAt = null;
  saveSystem(system);
  res.json({ ...system, enabled: true });
});

router.post("/sarah/disable", (_req: Request, res: Response) => {
  const system = getSystem();
  system.sarahEnabled = false;
  system.sarahPausedAt = new Date().toISOString();
  saveSystem(system);
  res.json({ ...system, enabled: false });
});

router.post("/test-texter", async (_req: Request, res: Response) => {
  try {
    await runFollowUpTexter();
    res.json({ success: true });
  } catch (err) {
    res.json({ success: false, error: (err as Error).message });
  }
});

router.get("/leads", async (_req: Request, res: Response) => {
  const leads = await getTodaysFollowUps();
  res.json({ leads });
});

router.get("/callbacks", (_req: Request, res: Response) => {
  const callbacks = getCallbacks();
  res.json(callbacks);
});

export default router;
