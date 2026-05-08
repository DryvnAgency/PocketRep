import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { env, live } from "@/lib/env";

let client: Anthropic | null = null;

function getClient(): Anthropic {
  if (!live.anthropic) {
    throw new Error("ANTHROPIC_API_KEY missing or placeholder.");
  }
  if (!client) {
    client = new Anthropic({ apiKey: env.anthropicApiKey });
  }
  return client;
}

export type GenInput = {
  customer: {
    first_name: string;
    vehicle_owned: string;
    months_in_vehicle: number;
    equity: "positive" | "neutral" | "negative";
  };
  offer: string;
  brandVoice: string;
  dealerName: string;
  managerFirstName: string;
};

export type GenResult = {
  text: string;
  usage: {
    input_tokens: number;
    output_tokens: number;
    cache_read_input_tokens: number;
    cache_creation_input_tokens: number;
  };
};

const PRICE_LEAK = /\$\s*\d/;
const MAX_LEN = 320;

export async function generateOutboundMessage(input: GenInput): Promise<GenResult> {
  const anthropic = getClient();

  const system = [
    {
      type: "text" as const,
      text: [
        `You write outbound SMS for ${input.dealerName}. The desk manager is ${input.managerFirstName}.`,
        `Brand voice: ${input.brandVoice}`,
        ``,
        `RULES — non-negotiable:`,
        `1. Output ONLY the SMS body, nothing else. No quotes, no labels.`,
        `2. Under 280 characters.`,
        `3. Reference the customer's actual current vehicle and how long they've owned it.`,
        `4. Sign as the manager from the dealership ("Eddie at ${input.dealerName}", etc.) — never invent a different name.`,
        `5. Never quote a price, payment, APR, term, monthly amount, or any specific dollar figure (the offer copy may mention dollars; do not invent additional ones).`,
        `6. Do not promise approvals, financing terms, or specific inventory.`,
        `7. End with a soft, low-pressure ask. No "act now," no fake urgency.`,
        `8. Sound like a human texting one customer, not a marketing blast.`,
        `9. Each message must be unique to this customer — vary phrasing, opener, and rhythm so no two customers in the same pool get a similar message.`,
        ``,
        `If the offer copy includes a dollar amount, you may include that single number verbatim. Never add others.`,
      ].join("\n"),
      cache_control: { type: "ephemeral" as const },
    },
  ];

  const userPrompt = [
    `Customer first name: ${input.customer.first_name}`,
    `Current vehicle: ${input.customer.vehicle_owned}`,
    `Months in vehicle: ${input.customer.months_in_vehicle}`,
    `Equity position: ${input.customer.equity}`,
    `Offer copy from manager: ${input.offer}`,
    ``,
    `Write the outbound SMS now. Output the SMS body only.`,
  ].join("\n");

  for (let attempt = 0; attempt < 2; attempt++) {
    const resp = await anthropic.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 220,
      system,
      messages: [{ role: "user", content: userPrompt }],
    });

    const block = resp.content.find((b) => b.type === "text");
    const text = block && block.type === "text" ? block.text.trim() : "";

    const valid = text.length > 0 && text.length <= MAX_LEN && !invalidPriceLeak(text, input.offer);
    if (valid) {
      const usage = resp.usage as unknown as GenResult["usage"];
      return {
        text,
        usage: {
          input_tokens: usage.input_tokens ?? 0,
          output_tokens: usage.output_tokens ?? 0,
          cache_read_input_tokens: usage.cache_read_input_tokens ?? 0,
          cache_creation_input_tokens: usage.cache_creation_input_tokens ?? 0,
        },
      };
    }
  }

  throw new Error("Sonnet generation failed validation after 1 retry.");
}

function invalidPriceLeak(text: string, offer: string): boolean {
  const allowed = new Set(Array.from(offer.matchAll(/\$\s*\d[\d,]*/g)).map((m) => m[0].replace(/\s+/g, "")));
  const found = Array.from(text.matchAll(/\$\s*\d[\d,]*/g)).map((m) => m[0].replace(/\s+/g, ""));
  return found.some((f) => !allowed.has(f));
}
