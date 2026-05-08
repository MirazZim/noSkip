import OpenAI from "npm:openai";

const OPENROUTER_API_KEY = Deno.env.get("OPENROUTER_API_KEY") ?? "";
export const OPENROUTER_MODEL = "mistralai/mistral-small-3.2-24b-instruct";

export const openrouter = new OpenAI({
  apiKey: OPENROUTER_API_KEY,
  baseURL: "https://openrouter.ai/api/v1",
  defaultHeaders: {
    "HTTP-Referer": "https://no-skip-main.vercel.app",
    "X-OpenRouter-Title": "NoSkip",
  },
});
