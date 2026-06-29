// claudeClient.ts — Shared Claude (Anthropic) client for all AI agents.
// Uses the user-provided ANTHROPIC_API_KEY from .env (Vercel env vars).
import Anthropic from "@anthropic-ai/sdk";

const apiKey = process.env.ANTHROPIC_API_KEY;
const MODEL = process.env.CLAUDE_MODEL || "claude-sonnet-4-6";
const MAX_TOKENS = parseInt(process.env.CLAUDE_MAX_TOKENS || "4096", 10);

let _client: Anthropic | null = null;
function client(): Anthropic {
  if (!apiKey) {
    throw new Error("ANTHROPIC_API_KEY is missing. Set it in Vercel Environment Variables.");
  }
  if (!_client) _client = new Anthropic({ apiKey });
  return _client;
}

type UserMessage = { role: "user" | "assistant"; content: string };

function toMessages(userMsg: string | UserMessage[]): UserMessage[] {
  return Array.isArray(userMsg) ? userMsg : [{ role: "user", content: userMsg }];
}

/** Standard Claude call returning the first text block. */
export async function askClaude(
  systemPrompt: string,
  userMsg: string | UserMessage[],
  options: Record<string, unknown> = {}
): Promise<string> {
  const resp = await client().messages.create({
    model: MODEL,
    max_tokens: MAX_TOKENS,
    system: systemPrompt,
    messages: toMessages(userMsg),
    ...options,
  });
  const block = resp.content[0];
  return block && block.type === "text" ? block.text : "";
}

/** Claude with web_search tool enabled (concatenates all text blocks). */
export async function askClaudeWithSearch(
  systemPrompt: string,
  userMsg: string | UserMessage[]
): Promise<string> {
  const resp = await client().messages.create({
    model: MODEL,
    max_tokens: MAX_TOKENS,
    system: systemPrompt,
    messages: toMessages(userMsg),
    tools: [{ type: "web_search_20250305", name: "web_search" } as any],
  });
  return resp.content
    .filter((b: any) => b.type === "text")
    .map((b: any) => b.text)
    .join("\n");
}

/** Claude returning structured JSON. Strips markdown fences and parses. */
export async function askClaudeJSON<T = any>(
  systemPrompt: string,
  userMsg: string | UserMessage[]
): Promise<T | { error: string; raw: string }> {
  const fullSystem =
    systemPrompt +
    "\n\nRéponds UNIQUEMENT en JSON valide, sans balises markdown, sans texte avant ou après.";
  const raw = await askClaude(fullSystem, userMsg);
  try {
    return JSON.parse(raw.replace(/```json|```/g, "").trim()) as T;
  } catch {
    return { error: "Parsing JSON échoué", raw };
  }
}

export const CLAUDE_INFO = { model: MODEL, max_tokens: MAX_TOKENS, configured: !!apiKey };
