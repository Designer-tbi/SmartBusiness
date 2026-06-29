// claudeClient.ts — Direct REST client to Anthropic Messages API.
// No @anthropic-ai/sdk dependency → zero bundling/CJS interop issues on Vercel.
// Uses native fetch (Node 18+).

const MODEL = process.env.CLAUDE_MODEL || "claude-sonnet-4-6";
const MAX_TOKENS = parseInt(process.env.CLAUDE_MAX_TOKENS || "4096", 10);
const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages";
const ANTHROPIC_VERSION = "2023-06-01";

type UserMessage = { role: "user" | "assistant"; content: string };

function toMessages(userMsg: string | UserMessage[]): UserMessage[] {
  return Array.isArray(userMsg) ? userMsg : [{ role: "user", content: userMsg }];
}

async function callAnthropic(body: any): Promise<any> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error("ANTHROPIC_API_KEY is missing. Set it in Vercel Environment Variables.");
  }
  const resp = await fetch(ANTHROPIC_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": ANTHROPIC_VERSION,
    },
    body: JSON.stringify(body),
  });
  if (!resp.ok) {
    const errText = await resp.text().catch(() => "");
    throw new Error(`Anthropic API ${resp.status}: ${errText.substring(0, 500)}`);
  }
  return resp.json();
}

export async function askClaude(
  systemPrompt: string,
  userMsg: string | UserMessage[],
  options: Record<string, unknown> = {}
): Promise<string> {
  const resp = await callAnthropic({
    model: MODEL,
    max_tokens: MAX_TOKENS,
    system: systemPrompt,
    messages: toMessages(userMsg),
    ...options,
  });
  const block = resp.content?.[0];
  return block && block.type === "text" ? block.text : "";
}

export async function askClaudeWithSearch(
  systemPrompt: string,
  userMsg: string | UserMessage[]
): Promise<string> {
  const resp = await callAnthropic({
    model: MODEL,
    max_tokens: MAX_TOKENS,
    system: systemPrompt,
    messages: toMessages(userMsg),
    tools: [{ type: "web_search_20250305", name: "web_search" }],
  });
  return (resp.content || [])
    .filter((b: any) => b.type === "text")
    .map((b: any) => b.text)
    .join("\n");
}

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

export const CLAUDE_INFO = { model: MODEL, max_tokens: MAX_TOKENS, configured: !!process.env.ANTHROPIC_API_KEY };
