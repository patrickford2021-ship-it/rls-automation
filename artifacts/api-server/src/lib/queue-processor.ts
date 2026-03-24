import { getSystem, getQueue, saveQueue, getStats, saveStats } from "./store.js";
import { getTwilioClient, CONFIG } from "./twilio-service.js";
import { logger } from "./logger.js";

export let queueProcessing = false;

export function setQueueProcessing(val: boolean): void {
  queueProcessing = val;
}

export async function processNextInQueue(_host?: string, _protocol?: string): Promise<void> {
  const system = getSystem();
  if (!system.sarahEnabled) { logger.info("Sarah is disabled — queue paused"); return; }

  const queue = getQueue();
  if (!queue.active || queue.paused || queueProcessing) return;
  if (queue.currentIndex >= queue.items.length) {
    queue.active = false;
    saveQueue(queue);
    logger.info("Queue completed");
    return;
  }

  const item = queue.items[queue.currentIndex];
  if (item.status !== "pending") {
    queue.currentIndex++;
    saveQueue(queue);
    setTimeout(() => processNextInQueue(), 500);
    return;
  }

  // Always use REPLIT_DEV_DOMAIN so Twilio can reach our webhooks
  const host    = process.env.REPLIT_DEV_DOMAIN || _host || "localhost";
  const baseUrl = `https://${host}`;

  const stats = getStats();
  stats.totalCalls++;
  saveStats(stats);

  queueProcessing = true;
  item.status = "calling";
  item.startedAt = new Date().toISOString();
  saveQueue(queue);

  try {
    const call = await getTwilioClient().calls.create({
      to: item.phone,
      from: CONFIG.twilioPhone(),
      url: `${baseUrl}/api/voice/start?business=${encodeURIComponent(item.name)}&queueId=${item.id}`,
      statusCallback: `${baseUrl}/api/voice/status?queueId=${item.id}`,
      statusCallbackMethod: "POST",
      timeout: 30,
      machineDetection: "DetectMessageEnd",
      asyncAmdStatusCallback: `${baseUrl}/api/voice/amd?queueId=${item.id}&business=${encodeURIComponent(item.name)}`,
    });
    item.callSid = call.sid;
    saveQueue(queue);
    logger.info({ business: item.name, sid: call.sid }, "Queue call initiated");
  } catch (err) {
    logger.error({ err }, "Queue call failed");
    item.status = "failed";
    item.error = (err as Error).message;
    queue.currentIndex++;
    queueProcessing = false;
    saveQueue(queue);
    setTimeout(() => processNextInQueue(host, protocol), 3000);
  }
}
