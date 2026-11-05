/**
 * Central Z-AI client factory (Task 166).
 *
 * WHY: `z-ai-web-dev-sdk`'s `ZAI.create()` ONLY reads a `.z-ai-config` JSON file
 * from {cwd, $HOME, /etc}. Vercel serverless filesystems have none of these
 * (and are read-only), so EVERY AI route (ai-chat, ai-interview, ai-emp, …)
 * threw on boot and silently fell back to canned one-line replies — the
 * "AI assistant only ever gives one answer" production bug.
 *
 * FIX: this module resolves the same config shape
 *      ({ baseUrl, apiKey, token?, chatId?, userId? })
 * from environment variables FIRST, then from the SDK's file locations, and
 * implements the `chat.completions.create` surface via direct fetch — no
 * filesystem writes, works on any host.
 *
 * Supported env (set in Vercel project settings):
 *   ZAI_CONFIG_JSON  – full JSON config (highest priority), or individually:
 *   ZAI_BASE_URL, ZAI_API_KEY, ZAI_TOKEN, ZAI_CHAT_ID, ZAI_USER_ID
 *
 * Usage (drop-in replacement for the SDK):
 *   import { getZAI } from '@/lib/zai';
 *   const zai = await getZAI();
 *   if (!zai) { ...fallback... }
 *   const res = await zai.chat.completions.create({ messages, stream: false });
 */
import fs from 'fs/promises';
import path from 'path';
import os from 'os';

export interface ZaiConfig {
  baseUrl: string;
  apiKey: string;
  token?: string;
  chatId?: string;
  userId?: string;
}

export interface ZaiChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface ZaiCompletionParams {
  messages: ZaiChatMessage[];
  stream?: boolean;
  model?: string;
  temperature?: number;
  max_tokens?: number;
  thinking?: { type: 'disabled' | 'enabled' };
}

export interface ZaiCompletionResult {
  choices: Array<{ index?: number; finish_reason?: string | null; message: { role: string; content: string } }>;
  usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number };
  model?: string;
  id?: string;
}

/* ── Config resolution ──────────────────────────────────────────────── */

function envConfig(): ZaiConfig | null {
  const raw = process.env.ZAI_CONFIG_JSON;
  if (raw && raw.trim()) {
    try {
      const parsed = JSON.parse(raw) as Partial<ZaiConfig>;
      if (parsed.baseUrl && parsed.apiKey) {
        return {
          baseUrl: parsed.baseUrl,
          apiKey: parsed.apiKey,
          token: parsed.token,
          chatId: parsed.chatId,
          userId: parsed.userId,
        };
      }
    } catch {
      console.error('ZAI_CONFIG_JSON is set but not valid JSON — falling back to individual vars');
    }
  }
  const baseUrl = process.env.ZAI_BASE_URL;
  const apiKey = process.env.ZAI_API_KEY;
  if (baseUrl && apiKey) {
    return {
      baseUrl,
      apiKey,
      token: process.env.ZAI_TOKEN || undefined,
      chatId: process.env.ZAI_CHAT_ID || undefined,
      userId: process.env.ZAI_USER_ID || undefined,
    };
  }
  return null;
}

/** Mirror of the SDK's file lookup: cwd → $HOME → /etc (for local dev). */
async function fileConfig(): Promise<ZaiConfig | null> {
  const homeDir = os.homedir();
  const configPaths = [
    path.join(process.cwd(), '.z-ai-config'),
    path.join(homeDir, '.z-ai-config'),
    '/etc/.z-ai-config',
  ];
  for (const filePath of configPaths) {
    try {
      const configStr = await fs.readFile(filePath, 'utf-8');
      const config = JSON.parse(configStr) as Partial<ZaiConfig>;
      if (config.baseUrl && config.apiKey) {
        return {
          baseUrl: config.baseUrl,
          apiKey: config.apiKey,
          token: config.token,
          chatId: config.chatId,
          userId: config.userId,
        };
      }
    } catch (error) {
      if ((error as NodeJS.ErrnoException)?.code !== 'ENOENT') {
        console.error(`Error reading Z-AI config at ${filePath}:`, error);
      }
    }
  }
  return null;
}

/** Resolve config from env, then files. Returns null when nothing is configured. */
export async function resolveZaiConfig(): Promise<ZaiConfig | null> {
  return envConfig() ?? (await fileConfig());
}

/* ── Minimal fetch client (mirrors the SDK surface the app uses) ────── */

class ZaiFetchClient {
  constructor(private config: ZaiConfig) {}

  private buildHeaders(): Record<string, string> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${this.config.apiKey}`,
      'X-Z-AI-From': 'Z',
    };
    if (this.config.chatId) headers['X-Chat-Id'] = this.config.chatId;
    if (this.config.userId) headers['X-User-Id'] = this.config.userId;
    if (this.config.token) headers['X-Token'] = this.config.token;
    return headers;
  }

  readonly chat = {
    completions: {
      /** Streamed call → ReadableStream. Non-streamed (default) → parsed result.
       *  Task 167b — 30s timeout + ONE retry on network-level failures
       *  (transient DNS/egress blips), so a hung or flaky vendor call can no
       *  longer stall the chat route silently. */
      create: async <S extends boolean | undefined = false>(
        params: ZaiCompletionParams & { stream?: S }
      ): Promise<S extends true ? ReadableStream : ZaiCompletionResult> => {
        const url = `${this.config.baseUrl.replace(/\/$/, '')}/chat/completions`;
        const body = {
          ...params,
          thinking: params.thinking ?? { type: 'disabled' as const },
        };

        let lastError: unknown;
        for (let attempt = 0; attempt < 2; attempt++) {
          if (attempt > 0) await new Promise((r) => setTimeout(r, 800));
          try {
            const res = await fetch(url, {
              method: 'POST',
              headers: this.buildHeaders(),
              body: JSON.stringify(body),
              signal: AbortSignal.timeout(30_000),
            });
            if (!res.ok) {
              const errorBody = await res.text().catch(() => '');
              // 4xx = request/vendor rejects this payload or credentials —
              // retrying will not help, surface immediately.
              throw new Error(`ZAI API request failed with status ${res.status}: ${errorBody.slice(0, 300)}`);
            }
            const contentType = res.headers.get('content-type') || '';
            if (body.stream && (contentType.includes('text/event-stream') || contentType.includes('text/plain'))) {
              return res.body as unknown as S extends true ? ReadableStream : ZaiCompletionResult;
            }
            return (await res.json()) as S extends true ? ReadableStream : ZaiCompletionResult;
          } catch (err) {
            lastError = err;
            const name = (err as Error)?.name || '';
            // TimeoutError / TypeError(fetch network failure) are transient —
            // retry once. HTTP-status errors (with a status in the message)
            // are deterministic — do not burn the second attempt.
            const isHttpError = /status \d+/.test(String((err as Error)?.message || ''));
            if (!isHttpError && (name === 'TimeoutError' || name === 'TypeError' || (err as Error)?.message?.includes('fetch failed'))) {
              continue;
            }
            throw err;
          }
        }
        throw lastError;
      },
    },
  };
}

/**
 * Returns a configured chat client, or null when no configuration exists.
 * Callers MUST handle null (skip AI, use their fallback path) instead of
 * letting the constructor throw — that is what broke production.
 */
export async function getZAI(): Promise<ZaiFetchClient | null> {
  const config = await resolveZaiConfig();
  if (!config) return null;
  return new ZaiFetchClient(config);
}
