// claudeClient.ts — Shared Claude (Anthropic) client for all AI agents.
// IMPORTANT: the @anthropic-ai/sdk import is LAZY (inside `client()`).
// This way, importing this file at startup never touches the SDK — if the SDK
// or its native deps fail to load on Vercel, the rest of the agents module
// still loads and the rest of the API stays up. Only actual agent execution
// would surface the SDK error.

const MODEL = process.env.CLAUDE_MODEL || "claude-sonnet-4-6";
const MAX_TOKENS = parseInt(process.env.CLAUDE_MAX_TOKENS || "4096", 10);

let _client: any = null;
async function client(): Promise<any> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error("ANTHROPIC_API_KEY is missing. Set it in Vercel Environment Variables.");
  }
  if (!_client) {
    // Dynamic import keeps the SDK off the function-startup critical path.
    const mod: any = await import("@anthropic-ai/sdk");
    const Anthropic = mod.default || mod.Anthropic || mod;
    _client = new Anthropic({ apiKey });
  }
  return _client;
}

type UserMessage = { role: "user" | "assistant"; content: string };
function toMessages(userMsg: string | UserMessage[]): UserMessage[] {
  return Array.isArray(userMsg) ? userMsg : [{ role: "user", content: userMsg }];
}

export async function askClaude(
  systemPrompt: string,
  userMsg: string | UserMessage[],
  options: Record<string, unknown> = {}
): Promise<string> {
  const c = await client();
  const resp = await c.messages.create({
    model: MODEL,
    max_tokens: MAX_TOKENS,
    system: systemPrompt,
    messages: toMessages(userMsg),
    ...options,
  });
  const block = resp.content[0];
  return block && block.type === "text" ? block.text : "";
}

export async function askClaudeWithSearch(
  systemPrompt: string,
  userMsg: string | UserMessage[]
): Promise<string> {
  const c = await client();
  const resp = await c.messages.create({
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
