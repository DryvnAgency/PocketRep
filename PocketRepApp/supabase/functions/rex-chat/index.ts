import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';

const GEMINI_API_KEY = Deno.env.get('GEMINI_API_KEY') ?? '';
const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_API_KEY}`;

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS });
  }

  try {
    const { message, image_base64, conversation_history = [], system_prompt } = await req.json();

    const systemInstruction = system_prompt ?? `You are Rex, an elite sales coach inside PocketRep. You help car dealership sales reps close more deals, handle objections, and stay sharp.

Your tone: Start responses with "hey" (lowercase). No em dashes. Punchy, direct, conversational — like a veteran closer coaching on the lot. No corporate fluff. Give real tactical advice reps can use in the next 5 minutes.

When a rep shares a screenshot of a text thread, read it and give them specific reply suggestions plus coaching on what's happening in that deal.

If the rep asks to log a contact or says something like "log [name] bought a [car]", embed a QUICK_LOG tag at the end of your reply:
[QUICK_LOG:{"contact_name":"Name","vehicle":"Year Make Model","note":"Bought the car"}]

Available quick actions:
- My Heat Sheet: Summarize their top 5 hottest leads by heat tier from their book
- Write a Script: Write a text or call script for a specific situation
- How's My Month: Give them a performance pep talk about hitting their number
- Log a Contact: Help them capture a customer interaction`;

    // Build contents array from conversation history
    const contents: any[] = conversation_history.map((msg: { role: string; content: string }) => ({
      role: msg.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: msg.content }],
    }));

    // Add current message (with optional image)
    const currentParts: any[] = [];
    if (image_base64) {
      currentParts.push({
        inlineData: {
          mimeType: 'image/jpeg',
          data: image_base64,
        },
      });
    }
    currentParts.push({ text: message });
    contents.push({ role: 'user', parts: currentParts });

    const res = await fetch(GEMINI_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        system_instruction: { parts: [{ text: systemInstruction }] },
        contents,
        generationConfig: {
          temperature: 0.85,
          maxOutputTokens: 1024,
        },
      }),
    });

    if (!res.ok) {
      const errText = await res.text();
      return new Response(JSON.stringify({ error: `Gemini error: ${errText}` }), {
        status: 500,
        headers: { ...CORS, 'Content-Type': 'application/json' },
      });
    }

    const geminiData = await res.json();
    const reply: string = geminiData.candidates?.[0]?.content?.parts?.[0]?.text ?? 'hey, something went wrong on my end — try again';

    // Parse QUICK_LOG if present
    let quick_log_data: Record<string, string> | null = null;
    const quickLogMatch = reply.match(/\[QUICK_LOG:([\s\S]*?)\]/);
    if (quickLogMatch) {
      try { quick_log_data = JSON.parse(quickLogMatch[1]); } catch {}
    }

    return new Response(JSON.stringify({ reply, quick_log_data }), {
      headers: { ...CORS, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { ...CORS, 'Content-Type': 'application/json' },
    });
  }
});
