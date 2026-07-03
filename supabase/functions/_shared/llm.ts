import OpenAI from "npm:openai";

// Gemini through Google's OpenAI-compatible endpoint — same SDK surface
// (chat.completions + response_format json_object), different base URL.
// The key lives in the GEMINI_API_KEY Supabase secret, never in the bundle.

const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY") ?? "";

export const LLM_MODEL = "gemini-3.5-flash";

export const llm = new OpenAI({
  apiKey: GEMINI_API_KEY,
  baseURL: "https://generativelanguage.googleapis.com/v1beta/openai/",
});
