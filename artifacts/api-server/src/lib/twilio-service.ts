import twilio from "twilio";
import axios from "axios";
import { getStats, saveStats } from "./store.js";
import { logger } from "./logger.js";

const getTwilioClient = () =>
  twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);

export const CONFIG = {
  twilioPhone:      () => process.env.TWILIO_PHONE_NUMBER || "",
  rickPhone:        () => process.env.RICK_PHONE || "",
  vedderPhone:      () => process.env.VEDDER_PHONE || "",
  appsScriptUrl:    () => process.env.APPS_SCRIPT_URL || "",
  appsScriptSecret: () => process.env.APPS_SCRIPT_SECRET || "",
};

export { getTwilioClient };

export function getNextTransfer(): { phone: string; name: string } {
  const stats = getStats();
  const isRick = stats.nextTransferTo === "rick";
  const phone  = isRick ? CONFIG.rickPhone() : CONFIG.vedderPhone();
  const name   = isRick ? "Rick" : "Vedder";
  stats.nextTransferTo = isRick ? "vedder" : "rick";
  stats.transfers++;
  if (isRick) stats.rickTransfers++; else stats.vedderTransfers++;
  saveStats(stats);
  return { phone, name };
}

export async function sendRepBriefing(
  repPhone: string,
  repName: string,
  callData: {
    businessName: string; phone: string;
    transcript: Array<{ speaker: string; text: string }>;
    industry: string; callDuration: number;
  }
): Promise<void> {
  const { businessName, phone, transcript, industry, callDuration } = callData;
  const transcriptText = transcript.map(t => `${t.speaker}: ${t.text}`).join("\n");

  let briefing = "They expressed interest in a demo website.";
  try {
    const res = await axios.post(
      "https://api.anthropic.com/v1/messages",
      {
        model: "claude-haiku-4-5",
        max_tokens: 150,
        messages: [{ role: "user", content: `Analyze this successful sales call and provide a 2-3 sentence briefing for the sales rep who is about to take the transfer. Focus on: what interested them, any objections raised, their mood/receptiveness, and one key tip for closing.\n\nBusiness: ${businessName}\nIndustry: ${industry}\nCall duration: ${callDuration}s\n\nTranscript:\n${transcriptText}\n\nReturn only the briefing text, no labels or formatting.` }],
      },
      {
        headers: {
          "x-api-key": process.env.ANTHROPIC_API_KEY,
          "anthropic-version": "2023-06-01",
          "content-type": "application/json",
        },
        timeout: 10000,
      }
    );
    briefing = (res.data as { content: Array<{ text: string }> }).content[0].text.trim();
  } catch {}

  const msg = `🔥 INCOMING TRANSFER — Pick up NOW!\n\nBusiness: ${businessName}\n📞 ${phone}\nIndustry: ${industry}\nTalk time: ${callDuration}s\n\n📋 ${briefing}\n\n💡 Sarah is connecting them now!`;

  try {
    await getTwilioClient().messages.create({
      body: msg,
      from: CONFIG.twilioPhone(),
      to: repPhone,
    });
  } catch (err) {
    logger.warn({ err }, "Briefing text failed");
  }
}

export async function getTodaysFollowUps(): Promise<Array<{
  name: string; phone: string; notes?: string; contactedBy?: string; status?: string;
}>> {
  try {
    const res = await axios.get(CONFIG.appsScriptUrl(), {
      params: { secret: CONFIG.appsScriptSecret() },
      timeout: 15000,
    });
    return ((res.data as { leads?: Array<{ name: string; phone: string; notes?: string; contactedBy?: string; status?: string }> }).leads || []).filter(l => {
      const status = (l.status || "").toLowerCase();
      return status !== "fuck em" && status !== "lost";
    });
  } catch (err) {
    logger.error({ err }, "Failed to fetch follow-ups");
    return [];
  }
}

export async function sendFollowUpText(repName: string, repPhone: string, leads: Array<{
  name: string; phone: string; notes?: string;
}>): Promise<void> {
  if (!leads.length) {
    await getTwilioClient().messages.create({
      body: `Good morning ${repName}! 🌅 No follow-ups today. Go find some fresh leads! 💪`,
      from: CONFIG.twilioPhone(), to: repPhone,
    });
    return;
  }
  const list = leads.map((l, i) => {
    const notes = l.notes ? `\n   📝 ${l.notes.substring(0, 80)}${l.notes.length > 80 ? "..." : ""}` : "";
    return `${i + 1}. ${l.name}\n   📞 ${l.phone}${notes}`;
  }).join("\n\n");
  await getTwilioClient().messages.create({
    body: `Good morning ${repName}! ☀️ You have ${leads.length} follow-up${leads.length !== 1 ? "s" : ""} today:\n\n${list}\n\n💰 Go close some deals!`,
    from: CONFIG.twilioPhone(), to: repPhone,
  });
}

export async function runFollowUpTexter(): Promise<void> {
  logger.info("Running daily follow-up texter");
  const leads = await getTodaysFollowUps();
  const rickLeads   = leads.filter(l => (l.contactedBy || "").toLowerCase().includes("rick"));
  const vedderLeads = leads.filter(l => (l.contactedBy || "").toLowerCase().includes("vedder"));
  const unassigned  = leads.filter(l => { const cb = (l.contactedBy || "").toLowerCase(); return !cb.includes("rick") && !cb.includes("vedder"); });
  await Promise.all([
    sendFollowUpText("Rick",   CONFIG.rickPhone(),   [...rickLeads, ...unassigned]),
    sendFollowUpText("Vedder", CONFIG.vedderPhone(), vedderLeads),
  ]);
}
