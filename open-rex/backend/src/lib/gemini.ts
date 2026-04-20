import { GoogleGenerativeAI } from '@google/generative-ai';

let _client: GoogleGenerativeAI | null = null;

function getClient(): GoogleGenerativeAI {
  if (_client) return _client;
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new Error('GEMINI_API_KEY not set');
  _client = new GoogleGenerativeAI(key);
  return _client;
}

export async function generateText(params: {
  system: string;
  user: string;
  temperature?: number;
  maxOutputTokens?: number;
}): Promise<string> {
  const modelName = process.env.GEMINI_MODEL || 'gemini-2.5-flash';
  const model = getClient().getGenerativeModel({
    model: modelName,
    systemInstruction: params.system,
    generationConfig: {
      temperature: params.temperature ?? 0.7,
      maxOutputTokens: params.maxOutputTokens ?? 400,
    },
  });
  const result = await model.generateContent(params.user);
  return result.response.text().trim();
}
