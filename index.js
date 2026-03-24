'use strict';

const express = require('express');
const cors    = require('cors');
const path    = require('path');
const fs      = require('fs');
const { v4: uuidv4 } = require('uuid');
const twilio  = require('twilio');
const axios   = require('axios');
const cron    = require('node-cron');

// ─── Config ───────────────────────────────────────────────────────────────────

const PORT       = process.env.PORT || 3000;
const AUDIO_DIR  = path.join(__dirname, 'audio');
const DATA_DIR   = path.join(__dirname, 'data');
const PUBLIC_DIR = path.join(__dirname, 'public');

[AUDIO_DIR, DATA_DIR, PUBLIC_DIR].forEach(d => { if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true }); });

const CONFIG = {
  twilioPhone:      () => process.env.TWILIO_PHONE_NUMBER || '',
  rickPhone:        () => process.env.RICK_PHONE || '',
  vedderPhone:      () => process.env.VEDDER_PHONE || '',
  appsScriptUrl:    () => process.env.APPS_SCRIPT_URL || '',
  appsScriptSecret: () => process.env.APPS_SCRIPT_SECRET || '',
};

const getTwilioClient = () =>
  twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);

// ─── Logger ───────────────────────────────────────────────────────────────────

const LOG_BUFFER = [];
const MAX_LOGS   = 500;

function pushLog(entry) {
  LOG_BUFFER.push(entry);
  if (LOG_BUFFER.length > MAX_LOGS) LOG_BUFFER.shift();
}

function getLogs(since) {
  if (!since) return LOG_BUFFER.slice(-100);
  return LOG_BUFFER.filter(e => e.ts > since);
}

const logger = ['trace','debug','info','warn','error','fatal'].reduce((acc, level) => {
  acc[level] = (objOrMsg, msg) => {
    const isObj = objOrMsg !== null && typeof objOrMsg === 'object';
    const message = isObj ? (msg || '') : String(objOrMsg || '');
    const data    = isObj ? objOrMsg : undefined;
    const entry   = { ts: Date.now(), level, msg: message, data };
    pushLog(entry);
    const prefix = `[${new Date().toISOString()}] [${level.toUpperCase()}]`;
    if (data) console[level === 'error' || level === 'fatal' || level === 'warn' ? level : 'log'](`${prefix} ${message}`, data);
    else      console[level === 'error' || level === 'fatal' || level === 'warn' ? level : 'log'](`${prefix} ${message}`);
  };
  return acc;
}, {});

// ─── Data Store ───────────────────────────────────────────────────────────────

const FILES = {
  queue:       path.join(DATA_DIR, 'queue.json'),
  transcripts: path.join(DATA_DIR, 'transcripts.json'),
  learnings:   path.join(DATA_DIR, 'learnings.json'),
  stats:       path.join(DATA_DIR, 'stats.json'),
  training:    path.join(DATA_DIR, 'training.json'),
  system:      path.join(DATA_DIR, 'system.json'),
  callbacks:   path.join(DATA_DIR, 'callbacks.json'),
};

function readJson(file, fallback) {
  try { if (fs.existsSync(file)) return JSON.parse(fs.readFileSync(file, 'utf8')); } catch {}
  return fallback;
}
function writeJson(file, data) { fs.writeFileSync(file, JSON.stringify(data, null, 2), 'utf8'); }

const getSystem    = ()  => readJson(FILES.system, { sarahEnabled: true, sarahPausedAt: null });
const saveSystem   = s   => writeJson(FILES.system, s);
const getStats     = ()  => readJson(FILES.stats, { totalCalls: 0, transfers: 0, rickTransfers: 0, vedderTransfers: 0, noAnswers: 0, voicemails: 0, hangups: 0, nextTransferTo: 'rick' });
const saveStats    = s   => writeJson(FILES.stats, s);
const getQueue     = ()  => readJson(FILES.queue, { items: [], active: false, currentIndex: 0, paused: false });
const saveQueue    = q   => writeJson(FILES.queue, q);
const getTranscripts = () => readJson(FILES.transcripts, []);
const getLearnings = ()  => readJson(FILES.learnings, { insights: [], lastUpdated: null, totalAnalyzed: 0 });
const saveLearnings= l   => writeJson(FILES.learnings, l);
const getTraining  = ()  => readJson(FILES.training, { videos: [], techniques: [], lastUpdated: null });
const saveTraining = t   => writeJson(FILES.training, t);
const getCallbacks = ()  => readJson(FILES.callbacks, []);
const saveCallbacks= c   => writeJson(FILES.callbacks, c);

function saveTranscript(t) {
  const all = getTranscripts();
  all.unshift(t);
  writeJson(FILES.transcripts, all.slice(0, 200));
}

// ─── Audio Store ──────────────────────────────────────────────────────────────

function saveAudio(buffer) {
  const id   = uuidv4();
  const file = path.join(AUDIO_DIR, `${id}.mp3`);
  fs.writeFileSync(file, buffer);
  try {
    const now = Date.now();
    for (const f of fs.readdirSync(AUDIO_DIR)) {
      const fp   = path.join(AUDIO_DIR, f);
      const stat = fs.statSync(fp);
      if (now - stat.mtimeMs > 10 * 60 * 1000) fs.unlinkSync(fp);
    }
  } catch {}
  return id;
}

function getAudioUrl(audioId, req) {
  const host = process.env.RAILWAY_PUBLIC_DOMAIN || process.env.REPLIT_DEV_DOMAIN || req.get('host') || 'localhost';
  const proto = process.env.RAILWAY_PUBLIC_DOMAIN ? 'https' : (req.headers['x-forwarded-proto'] || 'https');
  return `${proto}://${host}/audio/${audioId}.mp3`;
}

// ─── ElevenLabs TTS ───────────────────────────────────────────────────────────

const VOICE_ID = 'cgSgspJ2msm6clMCkdW9';

async function sarahSpeak(text, req) {
  try {
    const cleanText = text.replace(/\.\.\./g, ' ').replace(/—/g, ', ').replace(/[<>]/g, '').trim();
    if (!cleanText) return null;
    logger.info({ chars: cleanText.length }, 'Calling ElevenLabs');
    const response = await axios.post(
      `https://api.elevenlabs.io/v1/text-to-speech/${VOICE_ID}`,
      { text: cleanText, model_id: 'eleven_turbo_v2', voice_settings: { stability: 0.35, similarity_boost: 0.82, style: 0.45, use_speaker_boost: true } },
      { headers: { 'xi-api-key': process.env.ELEVENLABS_API_KEY || '', 'Content-Type': 'application/json', 'Accept': 'audio/mpeg' }, responseType: 'arraybuffer', timeout: 20000 }
    );
    const buffer = Buffer.from(response.data);
    if (!buffer || buffer.byteLength < 100) { logger.warn('ElevenLabs returned empty audio'); return null; }
    const id  = saveAudio(buffer);
    const url = getAudioUrl(id, req);
    logger.info({ bytes: buffer.byteLength, url }, 'ElevenLabs audio ready');
    return url;
  } catch (err) {
    const detail = err.response?.data ? Buffer.from(err.response.data).toString('utf8').substring(0, 300) : err.message;
    logger.error({ status: err.response?.status, detail }, 'ElevenLabs failed — Polly fallback');
    return null;
  }
}

function buildTwimlWithAudio(audioUrl, gatherAction, fallbackText) {
  const safe = (fallbackText || '').replace(/\.\.\./g, ' ').replace(/—/g, ', ').replace(/[<>&'"]/g, '').substring(0, 300);
  if (audioUrl) {
    return `<?xml version="1.0" encoding="UTF-8"?><Response><Play>${audioUrl}</Play><Gather input="speech" timeout="5" speechTimeout="2" action="${gatherAction}" method="POST"><Say> </Say></Gather><Redirect method="POST">${gatherAction}</Redirect></Response>`;
  }
  return `<?xml version="1.0" encoding="UTF-8"?><Response><Gather input="speech" timeout="5" speechTimeout="2" action="${gatherAction}" method="POST"><Say voice="Polly.Joanna-Neural" rate="92%">${safe}</Say></Gather><Redirect method="POST">${gatherAction}</Redirect></Response>`;
}

function buildHangupTwiml(audioUrl, fallbackText) {
  const safe = (fallbackText || '').replace(/\.\.\./g, ' ').replace(/—/g, ', ').replace(/[<>&'"]/g, '').substring(0, 300);
  if (audioUrl) return `<?xml version="1.0" encoding="UTF-8"?><Response><Play>${audioUrl}</Play><Hangup/></Response>`;
  return `<?xml version="1.0" encoding="UTF-8"?><Response><Say voice="Polly.Joanna-Neural">${safe}</Say><Hangup/></Response>`;
}

// ─── Sarah AI ─────────────────────────────────────────────────────────────────

function detectIndustry(name) {
  const n = name.toLowerCase();
  if (/barber|cuts|fade|shave|clipper|razor/.test(n))          return 'barbershop';
  if (/salon|beauty|nail|lash|brow|spa|blowout|hair/.test(n)) return 'salon';
  if (/dog|pet|groom|paw|pup|pooch|woof|fluff/.test(n))       return 'pet_grooming';
  if (/hvac|heat|cool|air|furnace|ac |duct|clima/.test(n))    return 'hvac';
  if (/auto|car|truck|motor|garage|mechanic|tire/.test(n))     return 'auto';
  if (/landscap|lawn|mow|garden|tree|mulch|sod/.test(n))      return 'landscaping';
  if (/clean|maid|janitor|sweep|spotless/.test(n))            return 'cleaning';
  if (/restaurant|food|eat|diner|cafe|pizza|burger/.test(n))  return 'restaurant';
  if (/plumb|pipe|drain|sewer/.test(n))                       return 'plumbing';
  if (/electric|wiring|panel|volt/.test(n))                   return 'electrical';
  if (/paint|coat|wall/.test(n))                              return 'painting';
  if (/roof|shingle|gutter/.test(n))                          return 'roofing';
  return 'general';
}

function getIndustryPitch(industry, businessName) {
  const pitches = {
    barbershop:   `For barbershops specifically, a website lets clients book appointments online 24/7 — most of your competitors don't have that yet. We can integrate booking right into the site so ${businessName} never loses a walk-in again.`,
    salon:        `For salons, we build sites that showcase your work with a portfolio gallery, online booking, and pricing. Clients research salons online before they ever call — without a website ${businessName} is invisible to them.`,
    pet_grooming: `Pet owners are incredibly loyal once they find a groomer they trust — but they find them online first. We build sites for groomers with appointment booking, service menus, and before/after galleries that convert visitors to regulars.`,
    hvac:         `HVAC is a high-ticket service and people only search when they need you urgently. Without a website ${businessName} is losing emergency calls to competitors right now. We build sites with click-to-call buttons and service area maps.`,
    auto:         `Auto repair customers always check reviews and websites before choosing a shop. We build sites for shops like ${businessName} with services listed, hours, location, and a Google review widget that builds instant trust.`,
    landscaping:  `Homeowners searching for landscapers go straight to Google — if ${businessName} doesn't have a website you're invisible to that entire market. We build sites with before/after galleries that sell the work for you.`,
    cleaning:     `Cleaning services live and die by trust. A professional website for ${businessName} with testimonials, services listed, and easy booking converts searchers into recurring clients automatically.`,
    restaurant:   `Restaurants without websites lose customers to OpenTable and Yelp taking a cut of every reservation. We build direct sites with menus, hours, and reservation links so ${businessName} keeps 100% of that business.`,
    plumbing:     `Plumbing is urgent — people search when pipes burst at midnight. Without a website ${businessName} misses every one of those emergency calls. We build sites with 24/7 call buttons that capture those high-value jobs.`,
    electrical:   `Electrical work is all about trust and licensing. A professional website for ${businessName} that shows credentials, service areas, and reviews converts searchers into booked jobs before they even call a competitor.`,
    painting:     `Painting is a visual business — your work sells itself, but only if people can see it. We build sites for painters with photo galleries, before/afters, and quote request forms that generate leads while you work.`,
    roofing:      `Roofing jobs are high ticket and homeowners research heavily before choosing. A website for ${businessName} with project photos, reviews, and a free estimate form captures leads your competitors are getting right now.`,
    general:      `Most local businesses are losing customers to competitors who show up online first. A professional website for ${businessName} puts you on the map and captures leads 24/7 even when you're closed.`,
  };
  return pitches[industry] || pitches.general;
}

function getTimeOfDayTone() {
  const hour = new Date().getHours();
  if (hour < 10) return 'energetic and warm — people are just starting their day, keep it quick and upbeat';
  if (hour < 12) return 'confident and direct — morning energy, people are in work mode';
  if (hour < 14) return 'friendly and brief — mid day, people are busy, respect their time';
  if (hour < 17) return 'relaxed and conversational — afternoon, people are more receptive';
  return 'warm and casual — end of day, people are winding down, be friendly not pushy';
}

function buildSarahPrompt(businessName, isCallback = false) {
  const learnings = getLearnings();
  const training  = getTraining();
  const industry  = detectIndustry(businessName);
  const tone      = getTimeOfDayTone();
  const pitch     = getIndustryPitch(industry, businessName);

  const learnedInsights   = learnings.insights.length ? '\nLEARNED FROM PREVIOUS SUCCESSFUL CALLS:\n' + learnings.insights.slice(0, 5).map(i => '• ' + i).join('\n') + '\n' : '';
  const trainedTechniques = training.techniques.length ? '\nTECHNIQUES FROM SALES TRAINING VIDEOS:\n' + training.techniques.slice(0, 8).map(t => '• ' + t).join('\n') + '\n' : '';
  const callbackIntro     = isCallback ? `This is a CALLBACK — this person already spoke with you and booked this time. They ARE interested. Open with: "Hey! It's Sarah from RLS Web Design... calling back just like we said. Is now still good?"` : '';

  return `You are Sarah, a 25 year old sales rep for RLS Web Design. You call local businesses to show them a free custom website demo. You are warm, confident, casual, and genuinely friendly — like a real person, not a corporate robot.

${callbackIntro}

CURRENT TONE: Be ${tone}

INDUSTRY: ${industry}
INDUSTRY PITCH: ${pitch}

THE OFFER:
• We built them a FREE custom demo website — no commitment to look at it
• Websites start at $200 one-time + $30/month
• We handle everything — design, hosting, updates, booking systems
${learnedInsights}${trainedTechniques}
HOW TO HANDLE OBJECTIONS — be natural, don't read these word for word:
• "Not interested" → "oh totally, I get it... I just wanted to mention we actually already built the site, so it's just like 30 seconds to take a look. can I text it to you real quick?"
• "I have a website" → "oh nice! honestly ours might still be an upgrade... mind if I send it over just to compare? zero obligation"
• "Too busy" → "yeah for sure, I'll be super quick — we made something for free and I just need like 30 seconds of your time"
• "How much?" → "so it starts at $200 one time, then $30 a month... but honestly look at the demo first — if you don't love it you don't pay anything"
• "Send an email" → "yeah absolutely... I'll text you the link right now. but hey, can I also get you on with our specialist real quick? he can answer everything"
• "I have a guy" → "oh no worries at all... this is totally just a free option to compare. let me text you the demo, no strings attached"
• Very rude or threatening → say exactly: HANG_UP

SPECIAL COMMANDS — say these exactly when needed:
• They say yes or want to know more → TRANSFER_NOW
• They want demo texted → TEXT_DEMO then keep talking
• They want a callback at specific time → BOOK_CALLBACK:[time they said]
• End call politely → HANG_UP

SPEECH RULES — this is critical for sounding human:
• Use "..." for natural pauses where you would breathe — like "yeah... I totally get that"
• Use "—" when cutting yourself off or changing direction — like "we could — actually yeah let me just text it to you"
• Write CASUALLY: use "yeah", "totally", "oh wow", "I mean", "honestly", "look", "hey", "so"
• NEVER write perfect corporate sentences — humans don't talk that way
• Keep ALL responses 1-3 sentences max — short and natural
• Never repeat yourself
• Don't give up until they say no 3 clear times`;
}

const activeCalls = {};

async function getClaudeResponse(callSid, userSpeech, businessName, isCallback = false) {
  if (!activeCalls[callSid]) {
    activeCalls[callSid] = { businessName, isCallback, history: [], transcript: [], noCount: 0, startTime: Date.now(), industry: detectIndustry(businessName) };
  }
  const call = activeCalls[callSid];
  if (userSpeech) {
    call.history.push({ role: 'user', content: userSpeech });
    call.transcript.push({ speaker: 'LEAD', text: userSpeech, time: new Date().toISOString() });
    const lower = userSpeech.toLowerCase();
    if (/not interested|no thank|don't want|stop calling|remove|don't call/.test(lower)) call.noCount++;
    if (call.noCount >= 3) return 'HANG_UP';
  }

  const claudePromise = axios.post(
    'https://api.anthropic.com/v1/messages',
    { model: 'claude-haiku-4-5', max_tokens: 120, system: buildSarahPrompt(businessName, isCallback), messages: call.history },
    { headers: { 'x-api-key': process.env.ANTHROPIC_API_KEY || '', 'anthropic-version': '2023-06-01', 'content-type': 'application/json' }, timeout: 12000 }
  );

  let reply = null;
  try {
    const res = await Promise.race([claudePromise, new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), 2500))]);
    reply = res.data.content[0].text.trim();
  } catch {}

  if (!reply) {
    try { const res = await claudePromise; reply = res.data.content[0].text.trim(); }
    catch { reply = "oh gosh, one sec — let me have someone from our team reach out to you directly. have a great day!"; }
  }

  call.history.push({ role: 'assistant', content: reply });
  call.transcript.push({ speaker: 'SARAH', text: reply, time: new Date().toISOString() });
  return reply;
}

async function analyzeSuccessfulCall(transcript, businessName) {
  try {
    const learnings = getLearnings();
    const existing  = learnings.insights.slice(0, 5).map(i => `- ${i}`).join('\n') || 'None yet';
    const transcriptText = transcript.map(t => `${t.speaker}: ${t.text}`).join('\n');
    const res = await axios.post(
      'https://api.anthropic.com/v1/messages',
      { model: 'claude-haiku-4-5', max_tokens: 120, messages: [{ role: 'user', content: `Analyze this successful sales call and extract ONE specific actionable insight (1-2 sentences) that made it work.\n\nBusiness: ${businessName}\nTranscript:\n${transcriptText}\n\nExisting insights:\n${existing}\n\nReturn only the new insight.` }] },
      { headers: { 'x-api-key': process.env.ANTHROPIC_API_KEY || '', 'anthropic-version': '2023-06-01', 'content-type': 'application/json' }, timeout: 15000 }
    );
    const insight = res.data.content[0].text.trim();
    learnings.insights.unshift(insight);
    learnings.insights = learnings.insights.slice(0, 25);
    learnings.lastUpdated = new Date().toISOString();
    learnings.totalAnalyzed++;
    saveLearnings(learnings);
  } catch {}
}

async function fetchYouTubeTranscript(videoUrl) {
  const m = videoUrl.match(/(?:v=|youtu\.be\/)([a-zA-Z0-9_-]{11})/);
  if (!m) throw new Error('Invalid YouTube URL');
  const videoId = m[1];
  const res = await axios.get('https://www.googleapis.com/youtube/v3/videos', { params: { id: videoId, part: 'snippet', key: process.env.GOOGLE_API_KEY }, timeout: 10000 });
  const video = res.data.items?.[0];
  if (!video) throw new Error('Video not found');
  return { videoId, title: video.snippet.title, channel: video.snippet.channelTitle, description: (video.snippet.description || '').substring(0, 500), url: videoUrl };
}

async function extractSalesTechniques(videoInfo) {
  const res = await axios.post(
    'https://api.anthropic.com/v1/messages',
    { model: 'claude-haiku-4-5', max_tokens: 400, messages: [{ role: 'user', content: `You are analyzing a sales training video to extract techniques for an AI sales agent named Sarah who cold calls local businesses to sell website design services.\n\nVideo: "${videoInfo.title}" by ${videoInfo.channel}\nDescription: ${videoInfo.description}\n\nExtract 3-5 specific actionable sales techniques. Return only the techniques, one per line, no numbering.` }] },
    { headers: { 'x-api-key': process.env.ANTHROPIC_API_KEY || '', 'anthropic-version': '2023-06-01', 'content-type': 'application/json' }, timeout: 30000 }
  );
  return res.data.content[0].text.trim().split('\n').filter(t => t.trim().length > 0);
}

// ─── Transfer / Twilio Service ────────────────────────────────────────────────

function getNextTransfer() {
  const stats  = getStats();
  const isRick = stats.nextTransferTo === 'rick';
  const phone  = isRick ? CONFIG.rickPhone() : CONFIG.vedderPhone();
  const name   = isRick ? 'Rick' : 'Vedder';
  stats.nextTransferTo = isRick ? 'vedder' : 'rick';
  stats.transfers++;
  if (isRick) stats.rickTransfers++; else stats.vedderTransfers++;
  saveStats(stats);
  return { phone, name };
}

async function sendRepBriefing(repPhone, repName, callData) {
  const { businessName, phone, transcript, industry, callDuration } = callData;
  const transcriptText = transcript.map(t => `${t.speaker}: ${t.text}`).join('\n');
  let briefing = 'They expressed interest in a demo website.';
  try {
    const res = await axios.post(
      'https://api.anthropic.com/v1/messages',
      { model: 'claude-haiku-4-5', max_tokens: 150, messages: [{ role: 'user', content: `Analyze this successful sales call and provide a 2-3 sentence briefing for the sales rep about to take the transfer.\n\nBusiness: ${businessName}\nIndustry: ${industry}\nCall duration: ${callDuration}s\nTranscript:\n${transcriptText}\n\nReturn only the briefing text.` }] },
      { headers: { 'x-api-key': process.env.ANTHROPIC_API_KEY || '', 'anthropic-version': '2023-06-01', 'content-type': 'application/json' }, timeout: 10000 }
    );
    briefing = res.data.content[0].text.trim();
  } catch {}
  const msg = `🔥 INCOMING TRANSFER — Pick up NOW!\n\nBusiness: ${businessName}\n📞 ${phone}\nIndustry: ${industry}\nTalk time: ${callDuration}s\n\n📋 ${briefing}\n\n💡 Sarah is connecting them now!`;
  try { await getTwilioClient().messages.create({ body: msg, from: CONFIG.twilioPhone(), to: repPhone }); }
  catch (err) { logger.warn({ err }, 'Briefing text failed'); }
}

async function getTodaysFollowUps() {
  try {
    const res = await axios.get(CONFIG.appsScriptUrl(), { params: { secret: CONFIG.appsScriptSecret() }, timeout: 15000 });
    return (res.data.leads || []).filter(l => { const s = (l.status || '').toLowerCase(); return s !== 'fuck em' && s !== 'lost'; });
  } catch (err) { logger.error({ err }, 'Failed to fetch follow-ups'); return []; }
}

async function sendFollowUpText(repName, repPhone, leads) {
  if (!leads.length) {
    await getTwilioClient().messages.create({ body: `Good morning ${repName}! 🌅 No follow-ups today. Go find some fresh leads! 💪`, from: CONFIG.twilioPhone(), to: repPhone });
    return;
  }
  const list = leads.map((l, i) => { const notes = l.notes ? `\n   📝 ${l.notes.substring(0, 80)}` : ''; return `${i + 1}. ${l.name}\n   📞 ${l.phone}${notes}`; }).join('\n\n');
  await getTwilioClient().messages.create({ body: `Good morning ${repName}! ☀️ You have ${leads.length} follow-up${leads.length !== 1 ? 's' : ''} today:\n\n${list}\n\n💰 Go close some deals!`, from: CONFIG.twilioPhone(), to: repPhone });
}

async function runFollowUpTexter() {
  logger.info('Running daily follow-up texter');
  const leads       = await getTodaysFollowUps();
  const rickLeads   = leads.filter(l => (l.contactedBy || '').toLowerCase().includes('rick'));
  const vedderLeads = leads.filter(l => (l.contactedBy || '').toLowerCase().includes('vedder'));
  const unassigned  = leads.filter(l => { const cb = (l.contactedBy || '').toLowerCase(); return !cb.includes('rick') && !cb.includes('vedder'); });
  await Promise.all([
    sendFollowUpText('Rick',   CONFIG.rickPhone(),   [...rickLeads, ...unassigned]),
    sendFollowUpText('Vedder', CONFIG.vedderPhone(), vedderLeads),
  ]);
}

// ─── Queue Processor ──────────────────────────────────────────────────────────

let queueProcessing = false;

async function processNextInQueue() {
  const system = getSystem();
  if (!system.sarahEnabled) { logger.info('Sarah is disabled — queue paused'); return; }

  const queue = getQueue();
  if (!queue.active || queue.paused || queueProcessing) return;
  if (queue.currentIndex >= queue.items.length) {
    queue.active = false;
    saveQueue(queue);
    logger.info('Queue completed');
    return;
  }

  const item = queue.items[queue.currentIndex];
  if (item.status !== 'pending') {
    queue.currentIndex++;
    saveQueue(queue);
    setTimeout(() => processNextInQueue(), 500);
    return;
  }

  const host    = process.env.RAILWAY_PUBLIC_DOMAIN || process.env.REPLIT_DEV_DOMAIN || 'localhost';
  const baseUrl = `https://${host}`;

  const stats = getStats();
  stats.totalCalls++;
  saveStats(stats);

  queueProcessing = true;
  item.status    = 'calling';
  item.startedAt = new Date().toISOString();
  saveQueue(queue);

  try {
    const call = await getTwilioClient().calls.create({
      to:   item.phone,
      from: CONFIG.twilioPhone(),
      url:  `${baseUrl}/api/voice/start?business=${encodeURIComponent(item.name)}&queueId=${item.id}`,
      statusCallback:       `${baseUrl}/api/voice/status?queueId=${item.id}`,
      statusCallbackMethod: 'POST',
      timeout:              30,
      machineDetection:     'DetectMessageEnd',
      asyncAmdStatusCallback: `${baseUrl}/api/voice/amd?queueId=${item.id}&business=${encodeURIComponent(item.name)}`,
    });
    item.callSid = call.sid;
    saveQueue(queue);
    logger.info({ business: item.name, sid: call.sid }, 'Queue call initiated');
  } catch (err) {
    logger.error({ err }, 'Queue call failed');
    item.status = 'failed';
    item.error  = err.message;
    queue.currentIndex++;
    queueProcessing = false;
    saveQueue(queue);
    setTimeout(() => processNextInQueue(), 3000);
  }
}

// ─── Express App ──────────────────────────────────────────────────────────────

const app = express();

// Public static routes — MUST be before any middleware so Twilio can fetch audio
app.use('/audio', express.static(AUDIO_DIR, {
  setHeaders: (res) => {
    res.set('Access-Control-Allow-Origin', '*');
    res.set('Cache-Control', 'no-cache');
    res.set('Content-Type', 'audio/mpeg');
  },
}));
app.use(express.static(PUBLIC_DIR));

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use((req, _res, next) => {
  logger.info({ method: req.method, url: req.url.split('?')[0] }, 'Request');
  next();
});

// ─── Routes: Health ───────────────────────────────────────────────────────────

app.get('/api/healthz', (_req, res) => res.json({ status: 'ok' }));

// ─── Routes: Logs ─────────────────────────────────────────────────────────────

app.get('/api/logs', (req, res) => {
  const since = req.query.since ? Number(req.query.since) : undefined;
  res.json(getLogs(since));
});

// ─── Routes: Stats / Control ──────────────────────────────────────────────────

app.get('/api/stats', (_req, res) => res.json(getStats()));

app.post('/api/call', async (req, res) => {
  const { phone, businessName } = req.body;
  if (!phone || !businessName) return void res.json({ success: false, error: 'phone and businessName required' });
  try {
    const host    = process.env.RAILWAY_PUBLIC_DOMAIN || process.env.REPLIT_DEV_DOMAIN || req.get('host') || '';
    const baseUrl = `https://${host}`;
    const stats   = getStats(); stats.totalCalls++; saveStats(stats);
    const call = await getTwilioClient().calls.create({
      to: phone, from: CONFIG.twilioPhone(),
      url: `${baseUrl}/api/voice/start?business=${encodeURIComponent(businessName)}`,
      timeout: 30, machineDetection: 'DetectMessageEnd',
      asyncAmdStatusCallback: `${baseUrl}/api/voice/amd?business=${encodeURIComponent(businessName)}`,
    });
    res.json({ success: true, callSid: call.sid });
  } catch (err) { res.json({ success: false, error: err.message }); }
});

// ─── Routes: Queue ────────────────────────────────────────────────────────────

app.get('/api/queue', (_req, res) => {
  const queue = getQueue();
  res.json({ ...queue, completed: queue.items.filter(i => i.status === 'completed').length, failed: queue.items.filter(i => i.status === 'failed').length });
});

app.post('/api/queue/add', (req, res) => {
  const { leads } = req.body;
  if (!leads || !leads.length) return void res.json({ success: false, error: 'leads array required' });
  const queue    = getQueue();
  const newItems = leads.filter(l => l.phone).map(l => ({ id: uuidv4(), name: l.name || 'Unknown', phone: l.phone, status: 'pending' }));
  queue.items.push(...newItems);
  saveQueue(queue);
  res.json({ success: true, added: newItems.length });
});

app.post('/api/queue/start', (req, res) => {
  const queue = getQueue();
  if (!queue.items.length) return void res.json({ success: false, error: 'Queue is empty' });
  queue.active = true; queue.paused = false;
  if (queue.currentIndex >= queue.items.length) queue.currentIndex = 0;
  saveQueue(queue);
  setTimeout(() => processNextInQueue(), 500);
  res.json({ success: true });
});

app.post('/api/queue/pause', (_req, res) => {
  const queue = getQueue(); queue.paused = true; saveQueue(queue);
  res.json({ success: true });
});

app.post('/api/queue/resume', (_req, res) => {
  const queue = getQueue(); queue.paused = false; saveQueue(queue);
  setTimeout(() => processNextInQueue(), 500);
  res.json({ success: true });
});

app.post('/api/queue/clear', (_req, res) => {
  saveQueue({ items: [], active: false, currentIndex: 0, paused: false });
  res.json({ success: true });
});

// ─── Routes: Transcripts / Learnings / Training ───────────────────────────────

app.get('/api/transcripts', (_req, res) => res.json(getTranscripts()));
app.get('/api/learnings',   (_req, res) => res.json(getLearnings()));
app.get('/api/training',    (_req, res) => res.json(getTraining()));
app.get('/api/callbacks',   (_req, res) => res.json(getCallbacks()));

app.post('/api/training/add', async (req, res) => {
  const { url } = req.body;
  if (!url) return void res.json({ success: false, error: 'url required' });
  try {
    const videoInfo  = await fetchYouTubeTranscript(url);
    const techniques = await extractSalesTechniques(videoInfo);
    const training   = getTraining();
    training.videos.push({ videoId: videoInfo.videoId, title: videoInfo.title, channel: videoInfo.channel, url: videoInfo.url, addedAt: new Date().toISOString(), techniques });
    training.techniques = [...new Set([...techniques, ...training.techniques])];
    training.lastUpdated = new Date().toISOString();
    saveTraining(training);
    res.json({ success: true, title: videoInfo.title, techniques });
  } catch (err) { res.json({ success: false, error: err.message }); }
});

// ─── Routes: Sarah Control ────────────────────────────────────────────────────

app.get('/api/sarah/status', (_req, res) => {
  const system = getSystem(); res.json({ ...system, enabled: system.sarahEnabled });
});
app.post('/api/sarah/enable', (_req, res) => {
  const system = getSystem(); system.sarahEnabled = true; system.sarahPausedAt = null; saveSystem(system);
  res.json({ ...system, enabled: true });
});
app.post('/api/sarah/disable', (_req, res) => {
  const system = getSystem(); system.sarahEnabled = false; system.sarahPausedAt = new Date().toISOString(); saveSystem(system);
  res.json({ ...system, enabled: false });
});

app.post('/api/test-texter', async (_req, res) => {
  try { await runFollowUpTexter(); res.json({ success: true }); }
  catch (err) { res.json({ success: false, error: err.message }); }
});

app.get('/api/leads', async (_req, res) => {
  const leads = await getTodaysFollowUps(); res.json({ leads });
});

// ─── Routes: Voice (Twilio webhooks) ─────────────────────────────────────────

app.post('/api/voice/amd', async (req, res) => {
  const { AnsweredBy } = req.body;
  const businessName = decodeURIComponent(req.query.business || 'your business');
  if (AnsweredBy === 'machine_start' || AnsweredBy === 'fax') {
    const stats = getStats(); stats.voicemails++; saveStats(stats);
    const vmText  = `hey! this is Sarah from RLS Web Design... sorry I missed you. I was calling because we built ${businessName} a free demo website — I'll text you the link. give us a call back whenever, no pressure!`;
    const audioUrl = await sarahSpeak(vmText, req);
    res.type('text/xml').send(buildHangupTwiml(audioUrl, vmText));
    try { await getTwilioClient().messages.create({ body: `hey! it's Sarah from RLS Web Design 👋 I just tried calling but missed you — we built you a free demo website, check it out whenever. no pressure at all!`, from: CONFIG.twilioPhone(), to: req.body.To || '' }); } catch {}
  } else { res.sendStatus(200); }
});

app.post('/api/voice/start', async (req, res) => {
  const businessName = decodeURIComponent(req.query.business || 'your business');
  const callSid      = req.body.CallSid || '';
  const isCallback   = req.query.isCallback === 'true';
  logger.info({ callSid, businessName, isCallback }, 'Voice start');
  const stats = getStats(); stats.totalCalls++; saveStats(stats);
  const opener       = isCallback ? `hey! it's Sarah from RLS Web Design... calling back just like we said. is now still a good time?` : `hey there, my name's Sarah — I'm calling from RLS Web Design. am I speaking with someone from ${businessName}?`;
  const gatherAction = `/api/voice/respond?business=${encodeURIComponent(businessName)}&callSid=${callSid}&isCallback=${isCallback}`;
  const audioUrl     = await sarahSpeak(opener, req);
  res.type('text/xml').send(buildTwimlWithAudio(audioUrl, gatherAction, opener));
});

app.post('/api/voice/respond', async (req, res) => {
  const businessName = decodeURIComponent(req.query.business || 'your business');
  const callSid      = req.body.CallSid || req.query.callSid || '';
  const isCallback   = req.query.isCallback === 'true';
  const speechResult = req.body.SpeechResult || '';
  const gatherAction = `/api/voice/respond?business=${encodeURIComponent(businessName)}&callSid=${callSid}&isCallback=${isCallback}`;
  logger.info({ callSid, speech: speechResult.substring(0, 80) }, 'Speech received');

  try {
    const reply = await getClaudeResponse(callSid, speechResult || 'hello', businessName, isCallback);
    const call  = activeCalls[callSid];
    logger.info({ callSid, reply: reply.substring(0, 80) }, 'Claude reply');

    if (reply === 'HANG_UP') {
      if (call) { saveTranscript({ id: uuidv4(), businessName, outcome: 'hung_up', transcript: call.transcript, createdAt: new Date().toISOString() }); delete activeCalls[callSid]; }
      const goodbyeText = "no problem at all! you have a great rest of your day... take care!";
      return void res.type('text/xml').send(buildHangupTwiml(await sarahSpeak(goodbyeText, req), goodbyeText));
    }

    if (reply === 'TRANSFER_NOW') {
      const { phone: transferPhone, name: transferName } = getNextTransfer();
      if (call) {
        const duration = Math.round((Date.now() - call.startTime) / 1000);
        await sendRepBriefing(transferPhone, transferName, { businessName, phone: req.body.To || req.body.Called || '', transcript: call.transcript, industry: call.industry, callDuration: duration });
        await analyzeSuccessfulCall(call.transcript, businessName);
        saveTranscript({ id: uuidv4(), businessName, outcome: 'transferred', transferredTo: transferName, transcript: call.transcript, duration, createdAt: new Date().toISOString() });
        delete activeCalls[callSid];
      }
      const transferText = `oh awesome... yeah let me get ${transferName} on the line for you right now — he's gonna walk you through everything. one second!`;
      const audioUrl     = await sarahSpeak(transferText, req);
      const safeText     = transferText.replace(/[<>&'"]/g, '');
      const transferFallbackUrl = `/api/voice/transfer-fallback?business=${encodeURIComponent(businessName)}&phone=${encodeURIComponent(req.body.To || '')}`;
      if (audioUrl) {
        return void res.type('text/xml').send(`<?xml version="1.0" encoding="UTF-8"?><Response><Play>${audioUrl}</Play><Dial callerId="${CONFIG.twilioPhone()}" timeout="20" action="${transferFallbackUrl}" method="POST"><Number>${transferPhone}</Number></Dial></Response>`);
      }
      return void res.type('text/xml').send(`<?xml version="1.0" encoding="UTF-8"?><Response><Say voice="Polly.Joanna-Neural">${safeText}</Say><Dial callerId="${CONFIG.twilioPhone()}" timeout="20" action="${transferFallbackUrl}" method="POST"><Number>${transferPhone}</Number></Dial></Response>`);
    }

    if (reply.startsWith('BOOK_CALLBACK:')) {
      const requestedTime = reply.replace('BOOK_CALLBACK:', '').trim();
      const { name: repName, phone: repPhone } = getNextTransfer();
      const callbacks = getCallbacks();
      callbacks.push({ id: uuidv4(), businessName, phone: req.body.To || req.body.Called || '', requestedTime, repName, createdAt: new Date().toISOString(), status: 'pending' });
      saveCallbacks(callbacks);
      try { await getTwilioClient().messages.create({ body: `📅 Callback scheduled!\n\nBusiness: ${businessName}\nRequested: ${requestedTime}\nAssigned to: ${repName}`, from: CONFIG.twilioPhone(), to: repPhone }); } catch {}
    }

    if (reply.startsWith('TEXT_DEMO')) {
      try { await getTwilioClient().messages.create({ body: `hey! it's Sarah from RLS Web Design 👋 here's the free demo website we built for you — take a look and let us know what you think!`, from: CONFIG.twilioPhone(), to: req.body.To || req.body.Called || '' }); } catch {}
    }

    const cleanReply = reply.replace(/^(TRANSFER_NOW|HANG_UP|TEXT_DEMO|BOOK_CALLBACK:[^\n]*)/i, '').trim();
    const sayText    = cleanReply || "so yeah... what do you think, would it be worth taking a quick look?";
    res.type('text/xml').send(buildTwimlWithAudio(await sarahSpeak(sayText, req), gatherAction, sayText));

  } catch (err) {
    logger.error({ err }, 'Voice respond error');
    const sorryText = "oh gosh, I'm sorry about that — let me have someone from our team reach out to you. have a great day!";
    return void res.type('text/xml').send(buildHangupTwiml(await sarahSpeak(sorryText, req), sorryText));
  }
});

app.post('/api/voice/status', (req, res) => {
  const { CallSid, CallStatus, Duration } = req.body;
  const queueId = req.query.queueId;
  logger.info({ CallSid, CallStatus, Duration }, 'Call status update');
  const stats = getStats();
  if (CallStatus === 'no-answer' || CallStatus === 'busy') stats.noAnswers++;
  saveStats(stats);
  const terminal = ['completed', 'failed', 'busy', 'no-answer', 'canceled'];
  if (CallStatus && terminal.includes(CallStatus)) {
    const call = activeCalls[CallSid || ''];
    if (call) {
      saveTranscript({ id: uuidv4(), businessName: call.businessName, outcome: CallStatus, duration: Duration ? parseInt(Duration) : undefined, transcript: call.transcript || [], createdAt: new Date().toISOString() });
      delete activeCalls[CallSid || ''];
    }
    if (queueId) {
      const queue = getQueue();
      const item  = queue.items.find(i => i.id === queueId);
      if (item) {
        item.status      = ['failed', 'busy', 'no-answer', 'canceled'].includes(CallStatus) ? 'failed' : 'completed';
        item.completedAt = new Date().toISOString();
        item.duration    = Duration;
        queue.currentIndex++;
        saveQueue(queue);
      }
      queueProcessing = false;
      setTimeout(() => processNextInQueue(), 5000);
    }
  }
  res.sendStatus(200);
});

app.post('/api/voice/transfer-fallback', async (req, res) => {
  const dialStatus   = req.body.DialCallStatus;
  const businessName = decodeURIComponent(req.query.business || 'the business');
  const leadPhone    = decodeURIComponent(req.query.phone || '');
  if (dialStatus !== 'completed') {
    logger.warn({ dialStatus }, 'Transfer failed — offering callback');
    const fallbackText = "oh gosh, I'm so sorry — our specialist just stepped away. could I schedule a quick callback for you? what time works best?";
    const audioUrl     = await sarahSpeak(fallbackText, req);
    const safeFallback = fallbackText.replace(/[<>&'"]/g, '');
    const bookFallbackAction = `/api/voice/book-fallback?business=${encodeURIComponent(businessName)}&phone=${encodeURIComponent(leadPhone)}`;
    if (audioUrl) {
      return void res.type('text/xml').send(`<?xml version="1.0" encoding="UTF-8"?><Response><Play>${audioUrl}</Play><Gather input="speech" timeout="8" speechTimeout="3" action="${bookFallbackAction}" method="POST"><Say> </Say></Gather><Say voice="Polly.Joanna-Neural">No worries, we will follow up soon. Have a great day!</Say><Hangup/></Response>`);
    }
    return void res.type('text/xml').send(`<?xml version="1.0" encoding="UTF-8"?><Response><Gather input="speech" timeout="8" speechTimeout="3" action="${bookFallbackAction}" method="POST"><Say voice="Polly.Joanna-Neural">${safeFallback}</Say></Gather><Hangup/></Response>`);
  }
  res.type('text/xml').send(`<?xml version="1.0" encoding="UTF-8"?><Response><Hangup/></Response>`);
});

app.post('/api/voice/book-fallback', async (req, res) => {
  const businessName = decodeURIComponent(req.query.business || 'the business');
  const leadPhone    = decodeURIComponent(req.query.phone || '');
  const speechResult = req.body.SpeechResult || 'a time that works for them';
  const callbacks    = getCallbacks();
  callbacks.push({ id: uuidv4(), businessName, phone: leadPhone, requestedTime: speechResult, repName: 'TBD', createdAt: new Date().toISOString(), status: 'pending' });
  saveCallbacks(callbacks);
  const confirmText = `perfect! I've got that down... our specialist will call you back then. thanks so much and have a great day!`;
  res.type('text/xml').send(buildHangupTwiml(await sarahSpeak(confirmText, req), confirmText));
});

// ─── Scheduled Jobs ───────────────────────────────────────────────────────────

// Daily follow-up texts at 8:00 AM
cron.schedule('0 8 * * *', () => {
  runFollowUpTexter().catch(err => logger.error({ err }, 'Cron texter failed'));
});

// ─── Start ────────────────────────────────────────────────────────────────────

app.listen(PORT, () => {
  logger.info({ port: PORT }, `RLS Automation Hub running`);
});
