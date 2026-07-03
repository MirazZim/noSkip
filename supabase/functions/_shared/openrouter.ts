import OpenAI from "npm:openai";

const OPENROUTER_API_KEY = Deno.env.get("OPENROUTER_API_KEY") ?? "";
// Must be a :free variant — the OpenRouter account has no purchased credits,
// so paid models fail with 402. Pick free models that support response_format.
export const OPENROUTER_MODEL = "qwen/qwen3-next-80b-a3b-instruct:free";

export const openrouter = new OpenAI({
  apiKey: OPENROUTER_API_KEY,
  baseURL: "https://openrouter.ai/api/v1",
  defaultHeaders: {
    "HTTP-Referer": "https://no-skip-main.vercel.app",
    "X-OpenRouter-Title": "NoSkip",
  },
});
