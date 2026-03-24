import axios from "axios";
import { getLearnings, getTraining, saveLearnings } from "./store.js";

export function detectIndustry(name: string): string {
  const n = name.toLowerCase();
  if (/barber|cuts|fade|shave|clipper|razor/.test(n))           return "barbershop";
  if (/salon|beauty|nail|lash|brow|spa|blowout|hair/.test(n))  return "salon";
  if (/dog|pet|groom|paw|pup|pooch|woof|fluff/.test(n))        return "pet_grooming";
  if (/hvac|heat|cool|air|furnace|ac |duct|clima/.test(n))     return "hvac";
  if (/auto|car|truck|motor|garage|mechanic|tire/.test(n))      return "auto";
  if (/landscap|lawn|mow|garden|tree|mulch|sod/.test(n))       return "landscaping";
  if (/clean|maid|janitor|sweep|spotless/.test(n))             return "cleaning";
  if (/restaurant|food|eat|diner|cafe|pizza|burger/.test(n))   return "restaurant";
  if (/plumb|pipe|drain|sewer/.test(n))                        return "plumbing";
  if (/electric|wiring|panel|volt/.test(n))                    return "electrical";
  if (/paint|coat|wall/.test(n))                               return "painting";
  if (/roof|shingle|gutter/.test(n))                           return "roofing";
  return "general";
}

export function getIndustryPitch(industry: string, businessName: string): string {
  const pitches: Record<string, string> = {
    barbershop:    `For barbershops specifically, a website lets clients book appointments online 24/7 — most of your competitors don't have that yet. We can integrate booking right into the site so ${businessName} never loses a walk-in again.`,
    salon:         `For salons, we build sites that showcase your work with a portfolio gallery, online booking, and pricing. Clients research salons online before they ever call — without a website ${businessName} is invisible to them.`,
    pet_grooming:  `Pet owners are incredibly loyal once they find a groomer they trust — but they find them online first. We build sites for groomers with appointment booking, service menus, and before/after galleries that convert visitors to regulars.`,
    hvac:          `HVAC is a high-ticket service and people only search when they need you urgently. Without a website ${businessName} is losing emergency calls to competitors right now. We build sites with click-to-call buttons and service area maps.`,
    auto:          `Auto repair customers always check reviews and websites before choosing a shop. We build sites for shops like ${businessName} with services listed, hours, location, and a Google review widget that builds instant trust.`,
    landscaping:   `Homeowners searching for landscapers go straight to Google — if ${businessName} doesn't have a website you're invisible to that entire market. We build sites with before/after galleries that sell the work for you.`,
    cleaning:      `Cleaning services live and die by trust. A professional website for ${businessName} with testimonials, services listed, and easy booking converts searchers into recurring clients automatically.`,
    restaurant:    `Restaurants without websites lose customers to OpenTable and Yelp taking a cut of every reservation. We build direct sites with menus, hours, and reservation links so ${businessName} keeps 100% of that business.`,
    plumbing:      `Plumbing is urgent — people search when pipes burst at midnight. Without a website ${businessName} misses every one of those emergency calls. We build sites with 24/7 call buttons that capture those high-value jobs.`,
    electrical:    `Electrical work is all about trust and licensing. A professional website for ${businessName} that shows credentials, service areas, and reviews converts searchers into booked jobs before they even call a competitor.`,
    painting:      `Painting is a visual business — your work sells itself, but only if people can see it. We build sites for painters with photo galleries, before/afters, and quote request forms that generate leads while you work.`,
    roofing:       `Roofing jobs are high ticket and homeowners research heavily before choosing. A website for ${businessName} with project photos, reviews, and a free estimate form captures leads your competitors are getting right now.`,
    general:       `Most local businesses are losing customers to competitors who show up online first. A professional website for ${businessName} puts you on the map and captures leads 24/7 even when you're closed.`,
  };
  return pitches[industry] || pitches.general;
}

export function getTimeOfDayTone(): string {
  const hour = new Date().getHours();
  if (hour < 10) return "energetic and warm — people are just starting their day, keep it quick and upbeat";
  if (hour < 12) return "confident and direct — morning energy, people are in work mode";
  if (hour < 14) return "friendly and brief — mid day, people are busy, respect their time";
  if (hour < 17) return "relaxed and conversational — afternoon, people are more receptive";
  return "warm and casual — end of day, people are winding down, be friendly not pushy";
}

export function buildSarahPrompt(businessName: string, isCallback = false): string {
  const learnings = getLearnings();
  const training  = getTraining();
  const industry  = detectIndustry(businessName);
  const tone      = getTimeOfDayTone();
  const pitch     = getIndustryPitch(industry, businessName);

  const learnedInsights = learnings.insights.length
    ? "\nLEARNED FROM PREVIOUS SUCCESSFUL CALLS:\n" + learnings.insights.slice(0, 5).map(i => "• " + i).join("\n") + "\n"
    : "";

  const trainedTechniques = training.techniques.length
    ? "\nTECHNIQUES FROM SALES TRAINING VIDEOS:\n" + training.techniques.slice(0, 8).map(t => "• " + t).join("\n") + "\n"
    : "";

  const callbackIntro = isCallback
    ? `This is a CALLBACK — this person already spoke with you and booked this time. They ARE interested. Open with: "Hey! It's Sarah from RLS Web Design... calling back just like we said. Is now still good?"`
    : "";

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
• Good example: "oh totally... honestly though, we already built the site so it literally takes like 30 seconds to look at. can I just text it to you real quick?"
• Bad example: "I completely understand your concern. However, we have already created a demonstration website for your business."
• Keep ALL responses 1-3 sentences max — short and natural
• End questions with rising casual energy — "...sound good?" "...what do you think?" "...worth a look?"
• Use lowercase casually in your thinking — it makes the speech rhythm more natural
• Never repeat yourself
• Don't give up until they say no 3 clear times`;
}

const ANTHROPIC_KEY = () => process.env.ANTHROPIC_API_KEY || "";

interface CallState {
  businessName: string;
  isCallback: boolean;
  history: Array<{ role: string; content: string }>;
  transcript: Array<{ speaker: string; text: string; time: string }>;
  noCount: number;
  startTime: number;
  industry: string;
}

export const activeCalls: Record<string, CallState> = {};

export async function getClaudeResponse(
  callSid: string,
  userSpeech: string,
  businessName: string,
  isCallback = false
): Promise<string> {
  if (!activeCalls[callSid]) {
    activeCalls[callSid] = {
      businessName, isCallback,
      history: [], transcript: [],
      noCount: 0, startTime: Date.now(),
      industry: detectIndustry(businessName),
    };
  }

  const call = activeCalls[callSid];

  if (userSpeech) {
    call.history.push({ role: "user", content: userSpeech });
    call.transcript.push({ speaker: "LEAD", text: userSpeech, time: new Date().toISOString() });
    const lower = userSpeech.toLowerCase();
    if (/not interested|no thank|don't want|stop calling|remove|don't call/.test(lower)) call.noCount++;
    if (call.noCount >= 3) return "HANG_UP";
  }

  const claudePromise = axios.post(
    "https://api.anthropic.com/v1/messages",
    {
      model: "claude-haiku-4-5",
      max_tokens: 120,
      system: buildSarahPrompt(businessName, isCallback),
      messages: call.history,
    },
    {
      headers: {
        "x-api-key": ANTHROPIC_KEY(),
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      timeout: 12000,
    }
  );

  const timeoutPromise = new Promise<null>((_, reject) =>
    setTimeout(() => reject(new Error("timeout")), 2500)
  );

  let reply: string | null = null;
  try {
    const res = await Promise.race([claudePromise, timeoutPromise]) as Awaited<typeof claudePromise>;
    reply = (res.data as { content: Array<{ text: string }> }).content[0].text.trim();
  } catch {
    reply = null;
  }

  if (!reply) {
    try {
      const res = await claudePromise;
      reply = (res.data as { content: Array<{ text: string }> }).content[0].text.trim();
    } catch {
      reply = "oh gosh, one sec — let me have someone from our team reach out to you directly. have a great day!";
    }
  }

  call.history.push({ role: "assistant", content: reply! });
  call.transcript.push({ speaker: "SARAH", text: reply!, time: new Date().toISOString() });
  return reply!;
}

export async function analyzeSuccessfulCall(
  transcript: Array<{ speaker: string; text: string }>,
  businessName: string
): Promise<void> {
  try {
    const learnings = getLearnings();
    const existing  = learnings.insights.slice(0, 5).map(i => `- ${i}`).join("\n") || "None yet";
    const transcriptText = transcript.map(t => `${t.speaker}: ${t.text}`).join("\n");

    const res = await axios.post(
      "https://api.anthropic.com/v1/messages",
      {
        model: "claude-haiku-4-5",
        max_tokens: 120,
        messages: [{ role: "user", content: `Analyze this successful sales call and extract ONE specific actionable insight (1-2 sentences) that made it work. Focus on exact phrasing, timing, or technique.\n\nBusiness: ${businessName}\nTranscript:\n${transcriptText}\n\nExisting insights:\n${existing}\n\nReturn only the new insight, nothing else.` }],
      },
      {
        headers: { "x-api-key": ANTHROPIC_KEY(), "anthropic-version": "2023-06-01", "content-type": "application/json" },
        timeout: 15000,
      }
    );

    const insight = (res.data as { content: Array<{ text: string }> }).content[0].text.trim();
    learnings.insights.unshift(insight);
    learnings.insights = learnings.insights.slice(0, 25);
    learnings.lastUpdated = new Date().toISOString();
    learnings.totalAnalyzed++;
    saveLearnings(learnings);
  } catch {}
}

export async function fetchYouTubeTranscript(videoUrl: string): Promise<{
  videoId: string; title: string; channel: string; description: string; url: string;
}> {
  const videoIdMatch = videoUrl.match(/(?:v=|youtu\.be\/)([a-zA-Z0-9_-]{11})/);
  if (!videoIdMatch) throw new Error("Invalid YouTube URL");
  const videoId = videoIdMatch[1];

  const detailsRes = await axios.get(
    "https://www.googleapis.com/youtube/v3/videos",
    { params: { id: videoId, part: "snippet", key: process.env.GOOGLE_API_KEY }, timeout: 10000 }
  );

  const video = (detailsRes.data as { items?: Array<{ snippet: { title: string; description: string; channelTitle: string } }> }).items?.[0];
  if (!video) throw new Error("Video not found");

  return {
    videoId,
    title: video.snippet.title,
    channel: video.snippet.channelTitle,
    description: video.snippet.description?.substring(0, 500) || "",
    url: videoUrl,
  };
}

export async function extractSalesTechniques(videoInfo: {
  title: string; channel: string; description: string;
}): Promise<string[]> {
  const prompt = `You are analyzing a sales training video to extract techniques for an AI sales agent named Sarah who cold calls local businesses to sell website design services.

Video: "${videoInfo.title}" by ${videoInfo.channel}
Description: ${videoInfo.description}

Based on this sales training content, extract 3-5 specific, actionable sales techniques that Sarah should use when:
1. Opening cold calls to local business owners
2. Handling objections like "not interested", "too expensive", "I already have someone"
3. Building rapport quickly with small business owners
4. Creating urgency without being pushy
5. Transitioning to a close or transfer

Format each technique as a single actionable sentence starting with a verb. Make them specific to selling websites to local businesses. Return only the techniques, one per line, no numbering or bullets.`;

  const res = await axios.post(
    "https://api.anthropic.com/v1/messages",
    { model: "claude-haiku-4-5", max_tokens: 400, messages: [{ role: "user", content: prompt }] },
    {
      headers: { "x-api-key": ANTHROPIC_KEY(), "anthropic-version": "2023-06-01", "content-type": "application/json" },
      timeout: 30000,
    }
  );

  return (res.data as { content: Array<{ text: string }> }).content[0].text
    .trim().split("\n").filter((t: string) => t.trim().length > 0);
}
