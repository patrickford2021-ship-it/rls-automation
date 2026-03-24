import { Router, type IRouter, type Request, type Response } from "express";
import { v4 as uuidv4 } from "uuid";
import {
  getStats, saveStats, getQueue, saveQueue,
  saveTranscript, getCallbacks, saveCallbacks,
} from "../lib/store.js";
import { activeCalls, getClaudeResponse, analyzeSuccessfulCall } from "../lib/sarah.js";
import { getTwilioClient, CONFIG, getNextTransfer, sendRepBriefing } from "../lib/twilio-service.js";
import { setQueueProcessing, processNextInQueue } from "../lib/queue-processor.js";
import { sarahSpeak, buildTwimlWithAudio, buildHangupTwiml } from "../lib/elevenlabs.js";
import { logger } from "../lib/logger.js";

const router: IRouter = Router();

// ─── AMD: Voicemail detection ─────────────────────────────────────────────────

router.post("/voice/amd", async (req: Request, res: Response) => {
  const { AnsweredBy } = req.body as { AnsweredBy?: string };
  const businessName = decodeURIComponent((req.query["business"] as string) || "your business");

  if (AnsweredBy === "machine_start" || AnsweredBy === "fax") {
    const stats = getStats();
    stats.voicemails++;
    saveStats(stats);

    const vmText = `hey! this is Sarah from RLS Web Design... sorry I missed you. I was calling because we built ${businessName} a free demo website — I'll text you the link. give us a call back whenever, no pressure!`;
    const audioUrl = await sarahSpeak(vmText, req);
    res.type("text/xml").send(buildHangupTwiml(audioUrl, vmText));

    try {
      await getTwilioClient().messages.create({
        body: `hey! it's Sarah from RLS Web Design 👋 I just tried calling but missed you — we built you a free demo website, check it out whenever. no pressure at all!`,
        from: CONFIG.twilioPhone(),
        to: (req.body as { To?: string }).To || "",
      });
    } catch {}
  } else {
    res.sendStatus(200);
  }
});

// ─── Start: Opening message ───────────────────────────────────────────────────

router.post("/voice/start", async (req: Request, res: Response) => {
  const businessName = decodeURIComponent((req.query["business"] as string) || "your business");
  const callSid      = (req.body as { CallSid?: string }).CallSid || "";
  const isCallback   = req.query["isCallback"] === "true";

  logger.info({ callSid, businessName, isCallback }, "Voice start");

  const stats = getStats();
  stats.totalCalls++;
  saveStats(stats);

  const opener = isCallback
    ? `hey! it's Sarah from RLS Web Design... calling back just like we said. is now still a good time?`
    : `hey there, my name's Sarah — I'm calling from RLS Web Design. am I speaking with someone from ${businessName}?`;

  const gatherAction = `/api/voice/respond?business=${encodeURIComponent(businessName)}&callSid=${callSid}&isCallback=${isCallback}`;
  const audioUrl = await sarahSpeak(opener, req);
  logger.info({ audioUrl: audioUrl ?? "null—using Polly" }, "Voice start audio");
  res.type("text/xml").send(buildTwimlWithAudio(audioUrl, gatherAction, opener));
});

// ─── Respond: Main conversation loop ─────────────────────────────────────────

router.post("/voice/respond", async (req: Request, res: Response) => {
  const businessName = decodeURIComponent((req.query["business"] as string) || "your business");
  const body = req.body as { CallSid?: string; SpeechResult?: string; To?: string; Called?: string };
  const callSid      = body.CallSid || (req.query["callSid"] as string) || "";
  const isCallback   = req.query["isCallback"] === "true";
  const speechResult = body.SpeechResult || "";
  const gatherAction = `/api/voice/respond?business=${encodeURIComponent(businessName)}&callSid=${callSid}&isCallback=${isCallback}`;

  logger.info({ callSid, speech: speechResult.substring(0, 80) }, "Speech received");

  try {
    const reply = await getClaudeResponse(callSid, speechResult || "hello", businessName, isCallback);
    const call  = activeCalls[callSid];
    logger.info({ callSid, reply: reply.substring(0, 80) }, "Claude reply");

    // ── HANG UP ──
    if (reply === "HANG_UP") {
      if (call) {
        saveTranscript({ id: uuidv4(), businessName, outcome: "hung_up", transcript: call.transcript, createdAt: new Date().toISOString() });
        delete activeCalls[callSid];
      }
      const goodbyeText = "no problem at all! you have a great rest of your day... take care!";
      const audioUrl = await sarahSpeak(goodbyeText, req);
      return void res.type("text/xml").send(buildHangupTwiml(audioUrl, goodbyeText));
    }

    // ── TRANSFER ──
    if (reply === "TRANSFER_NOW") {
      const { phone: transferPhone, name: transferName } = getNextTransfer();
      if (call) {
        const duration = Math.round((Date.now() - call.startTime) / 1000);
        await sendRepBriefing(transferPhone, transferName, {
          businessName, phone: body.To || body.Called || "",
          transcript: call.transcript, industry: call.industry,
          callDuration: duration,
        });
        await analyzeSuccessfulCall(call.transcript, businessName);
        saveTranscript({
          id: uuidv4(), businessName, outcome: "transferred",
          transferredTo: transferName, transcript: call.transcript,
          duration, createdAt: new Date().toISOString(),
        });
        delete activeCalls[callSid];
      }

      const transferText = `oh awesome... yeah let me get ${transferName} on the line for you right now — he's gonna walk you through everything. one second!`;
      const audioUrl = await sarahSpeak(transferText, req);
      const safeText = transferText.replace(/[<>&'"]/g, "");
      const transferFallbackUrl = `/api/voice/transfer-fallback?business=${encodeURIComponent(businessName)}&phone=${encodeURIComponent(body.To || "")}`;

      if (audioUrl) {
        return void res.type("text/xml").send(`<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Play>${audioUrl}</Play>
  <Dial callerId="${CONFIG.twilioPhone()}" timeout="20" action="${transferFallbackUrl}" method="POST">
    <Number>${transferPhone}</Number>
  </Dial>
</Response>`);
      }
      return void res.type("text/xml").send(`<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="Polly.Joanna-Neural">${safeText}</Say>
  <Dial callerId="${CONFIG.twilioPhone()}" timeout="20" action="${transferFallbackUrl}" method="POST">
    <Number>${transferPhone}</Number>
  </Dial>
</Response>`);
    }

    // ── BOOK CALLBACK ──
    if (reply.startsWith("BOOK_CALLBACK:")) {
      const requestedTime = reply.replace("BOOK_CALLBACK:", "").trim();
      const { name: repName, phone: repPhone } = getNextTransfer();
      const callbacks = getCallbacks();
      callbacks.push({
        id: uuidv4(), businessName, phone: body.To || body.Called || "",
        requestedTime, repName, createdAt: new Date().toISOString(), status: "pending",
      });
      saveCallbacks(callbacks);
      try {
        await getTwilioClient().messages.create({
          body: `📅 Callback scheduled!\n\nBusiness: ${businessName}\nRequested: ${requestedTime}\nAssigned to: ${repName}`,
          from: CONFIG.twilioPhone(), to: repPhone,
        });
      } catch {}
    }

    // ── TEXT DEMO ──
    if (reply.startsWith("TEXT_DEMO")) {
      try {
        await getTwilioClient().messages.create({
          body: `hey! it's Sarah from RLS Web Design 👋 here's the free demo website we built for you — take a look and let us know what you think!`,
          from: CONFIG.twilioPhone(),
          to: body.To || body.Called || "",
        });
      } catch {}
    }

    // ── Normal reply ──
    const cleanReply = reply
      .replace(/^(TRANSFER_NOW|HANG_UP|TEXT_DEMO|BOOK_CALLBACK:[^\n]*)/i, "")
      .trim();

    const sayText = cleanReply || "so yeah... what do you think, would it be worth taking a quick look?";
    const audioUrl = await sarahSpeak(sayText, req);
    res.type("text/xml").send(buildTwimlWithAudio(audioUrl, gatherAction, sayText));

  } catch (err) {
    logger.error({ err }, "Voice respond error");
    const sorryText = "oh gosh, I'm sorry about that — let me have someone from our team reach out to you. have a great day!";
    const audioUrl = await sarahSpeak(sorryText, req);
    return void res.type("text/xml").send(buildHangupTwiml(audioUrl, sorryText));
  }
});

// ─── Status: Call completed / queue advance ───────────────────────────────────

router.post("/voice/status", (req: Request, res: Response) => {
  const body = req.body as { CallSid?: string; CallStatus?: string; Duration?: string };
  const { CallSid, CallStatus, Duration } = body;
  const queueId = req.query["queueId"] as string;
  const host    = req.get("host") || "";
  const proto   = (req.headers["x-forwarded-proto"] as string) || "https";

  logger.info({ CallSid, CallStatus, Duration }, "Call status update");

  const stats = getStats();
  if (CallStatus === "no-answer" || CallStatus === "busy") stats.noAnswers++;
  saveStats(stats);

  const terminal = ["completed", "failed", "busy", "no-answer", "canceled"];
  if (CallStatus && terminal.includes(CallStatus)) {
    const call = activeCalls[CallSid || ""];
    if (call) {
      saveTranscript({
        id: uuidv4(), businessName: call.businessName,
        outcome: CallStatus,
        duration: Duration ? parseInt(Duration) : undefined,
        transcript: call.transcript || [],
        createdAt: new Date().toISOString(),
      });
      delete activeCalls[CallSid || ""];
    }

    if (queueId) {
      const queue = getQueue();
      const item  = queue.items.find(i => i.id === queueId);
      if (item) {
        item.status      = ["failed", "busy", "no-answer", "canceled"].includes(CallStatus) ? "failed" : "completed";
        item.completedAt = new Date().toISOString();
        item.duration    = Duration;
        queue.currentIndex++;
        saveQueue(queue);
      }
      setQueueProcessing(false);
      setTimeout(() => processNextInQueue(host, proto), 5000);
    }
  }

  res.sendStatus(200);
});

// ─── Transfer fallback: Rep didn't answer ─────────────────────────────────────

router.post("/voice/transfer-fallback", async (req: Request, res: Response) => {
  const body = req.body as { DialCallStatus?: string };
  const dialStatus   = body.DialCallStatus;
  const businessName = decodeURIComponent((req.query["business"] as string) || "the business");
  const leadPhone    = decodeURIComponent((req.query["phone"] as string) || "");

  if (dialStatus !== "completed") {
    logger.warn({ dialStatus }, "Transfer failed — offering callback");
    const fallbackText = "oh gosh, I'm so sorry — our specialist just stepped away. could I schedule a quick callback for you? what time works best?";
    const audioUrl = await sarahSpeak(fallbackText, req);
    const safeFallback = fallbackText.replace(/[<>&'"]/g, "");
    const bookFallbackAction = `/api/voice/book-fallback?business=${encodeURIComponent(businessName)}&phone=${encodeURIComponent(leadPhone)}`;

    if (audioUrl) {
      return void res.type("text/xml").send(`<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Play>${audioUrl}</Play>
  <Gather input="speech" timeout="8" speechTimeout="3" action="${bookFallbackAction}" method="POST">
    <Say> </Say>
  </Gather>
  <Say voice="Polly.Joanna-Neural">No worries, we will follow up soon. Have a great day!</Say>
  <Hangup/>
</Response>`);
    }
    return void res.type("text/xml").send(`<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Gather input="speech" timeout="8" speechTimeout="3" action="${bookFallbackAction}" method="POST">
    <Say voice="Polly.Joanna-Neural">${safeFallback}</Say>
  </Gather>
  <Hangup/>
</Response>`);
  }

  res.type("text/xml").send(`<?xml version="1.0" encoding="UTF-8"?><Response><Hangup/></Response>`);
});

// ─── Book fallback: Capture callback time from speech ────────────────────────

router.post("/voice/book-fallback", async (req: Request, res: Response) => {
  const body = req.body as { SpeechResult?: string };
  const businessName = decodeURIComponent((req.query["business"] as string) || "the business");
  const leadPhone    = decodeURIComponent((req.query["phone"] as string) || "");
  const speechResult = body.SpeechResult || "a time that works for them";

  const callbacks = getCallbacks();
  callbacks.push({
    id: uuidv4(), businessName, phone: leadPhone,
    requestedTime: speechResult, repName: "TBD",
    createdAt: new Date().toISOString(), status: "pending",
  });
  saveCallbacks(callbacks);

  const confirmText = `perfect! I've got that down... our specialist will call you back then. thanks so much and have a great day!`;
  const audioUrl = await sarahSpeak(confirmText, req);
  res.type("text/xml").send(buildHangupTwiml(audioUrl, confirmText));
});

export default router;
