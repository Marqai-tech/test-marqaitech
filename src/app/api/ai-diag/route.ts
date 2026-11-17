import { NextRequest, NextResponse } from 'next/server';
import { getZAI, resolveZaiConfig } from '@/lib/zai';
import { verifyToken, getTokenFromHeaders } from '@/lib/auth';

/**
 * Task 167b — AI connectivity diagnostic (auth-protected).
 *
 * Runs the EXACT same ZAI chat call /api/ai-chat makes and returns what
 * actually happened inside the Vercel runtime: whether env config resolves,
 * and the real status / error name+message of the fetch. No secrets are
 * returned — only booleans, the baseUrl HOST, and error text.
 */
export async function POST(request: NextRequest) {
  const token = getTokenFromHeaders(request);
  if (!token || !(await verifyToken(token))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const config = await resolveZaiConfig();
  const result: Record<string, unknown> = {
    time: new Date().toISOString(),
    envConfigured: {
      baseUrl: Boolean(process.env.ZAI_BASE_URL),
      apiKey: Boolean(process.env.ZAI_API_KEY),
      token: Boolean(process.env.ZAI_TOKEN),
      configJson: Boolean(process.env.ZAI_CONFIG_JSON),
      fileResolved: Boolean(config),
      baseUrlHost: config ? (() => { try { return new URL(config.baseUrl).host; } catch { return 'INVALID_URL'; } })() : null,
    },
  };

  if (!config) {
    result.call = { attempted: false, reason: 'no config resolved — getZAI() would return null' };
    return NextResponse.json(result);
  }

  const zai = await getZAI();
  const started = Date.now();
  try {
    const response = await zai!.chat.completions.create({
      messages: [
        { role: 'system', content: 'Reply with the single word OK.' },
        { role: 'user', content: 'ping' },
      ],
      stream: false,
    });
    result.call = {
      attempted: true,
      ok: true,
      ms: Date.now() - started,
      reply: response?.choices?.[0]?.message?.content ?? null,
      model: (response as { model?: string })?.model ?? null,
    };
  } catch (err) {
    result.call = {
      attempted: true,
      ok: false,
      ms: Date.now() - started,
      errorName: (err as Error)?.name || 'Unknown',
      errorMessage: String((err as Error)?.message || err).slice(0, 500),
    };
  }

  return NextResponse.json(result);
}
