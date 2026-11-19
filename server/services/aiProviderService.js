/**
 * Modular AI Provider Service (Phase 15)
 * Supports external LLM providers (Gemini, OpenAI, Anthropic) via env vars OR
 * GRICC Grounded Deterministic Synthesis (zero-key default).
 * Never stores or exposes API keys in SQLite or frontend responses.
 */

const SUPPORTED_PROVIDERS = ['gricc-deterministic', 'gemini', 'openai', 'anthropic'];

let runtimeConfig = {
  provider: process.env.AI_PROVIDER || 'gricc-deterministic',
  model: process.env.AI_MODEL || 'grounded-retrieval-v1',
  timeoutMs: Number(process.env.AI_TIMEOUT_MS || 12000),
  maxRetries: Number(process.env.AI_MAX_RETRIES || 2),
};

function createHttpError(status, message, name = 'ProviderError') {
  const err = new Error(message);
  err.status = status;
  err.name = name;
  return err;
}

async function fetchWithTimeout(url, options, timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

async function callExternalProvider({ systemPrompt, userPrompt, config }) {
  const apiKey = process.env.AI_API_KEY;
  if (!apiKey || !apiKey.trim()) {
    throw createHttpError(
      503,
      `AI provider "${config.provider}" is selected but AI_API_KEY is not configured in environment variables.`,
      'ProviderUnavailableError'
    );
  }

  let attempt = 0;
  let lastErr = null;

  while (attempt <= config.maxRetries) {
    try {
      let res;
      if (config.provider === 'openai') {
        res = await fetchWithTimeout(
          'https://api.openai.com/v1/chat/completions',
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${apiKey}`,
            },
            body: JSON.stringify({
              model: config.model || 'gpt-4o-mini',
              temperature: 0.1,
              messages: [
                { role: 'system', content: systemPrompt },
                { role: 'user', content: userPrompt },
              ],
            }),
          },
          config.timeoutMs
        );
        if (res.ok) {
          const data = await res.json();
          return data?.choices?.[0]?.message?.content || '';
        }
      } else if (config.provider === 'gemini') {
        const model = config.model || 'gemini-2.0-flash';
        res = await fetchWithTimeout(
          `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'x-goog-api-key': apiKey,
            },
            body: JSON.stringify({
              systemInstruction: { parts: [{ text: systemPrompt }] },
              contents: [{ role: 'user', parts: [{ text: userPrompt }] }],
              generationConfig: { temperature: 0.1 },
            }),
          },
          config.timeoutMs
        );
        if (res.ok) {
          const data = await res.json();
          return data?.candidates?.[0]?.content?.parts?.[0]?.text || '';
        }
      } else if (config.provider === 'anthropic') {
        res = await fetchWithTimeout(
          'https://api.anthropic.com/v1/messages',
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'x-api-key': apiKey,
              'anthropic-version': '2023-06-01',
            },
            body: JSON.stringify({
              model: config.model || 'claude-3-5-sonnet-latest',
              max_tokens: 1200,
              system: systemPrompt,
              messages: [{ role: 'user', content: userPrompt }],
            }),
          },
          config.timeoutMs
        );
        if (res.ok) {
          const data = await res.json();
          return data?.content?.[0]?.text || '';
        }
      }

      const status = res?.status || 502;
      if (status === 429 || status >= 500) {
        lastErr = createHttpError(503, `External AI provider returned HTTP ${status}.`, 'ProviderUnavailableError');
      } else {
        throw createHttpError(502, `External AI provider rejected request with HTTP ${status}.`, 'ProviderError');
      }
    } catch (err) {
      if (err.name === 'AbortError') {
        lastErr = createHttpError(504, `AI provider request timed out after ${config.timeoutMs}ms.`, 'ProviderTimeoutError');
      } else if (Number.isInteger(err.status) && err.status >= 400 && err.status < 500) {
        throw createHttpError(err.status, 'External AI provider request failed with client error.', 'ProviderError');
      } else {
        lastErr = createHttpError(
          503,
          'AI provider network request failed.',
          'ProviderUnavailableError'
        );
      }
    }

    attempt += 1;
    if (attempt <= config.maxRetries) {
      await new Promise((r) => setTimeout(r, 250 * attempt));
    }
  }

  throw lastErr || createHttpError(503, 'AI provider is currently unavailable.', 'ProviderUnavailableError');
}

export const aiProviderService = {
  getConfig() {
    const hasKey = Boolean(process.env.AI_API_KEY && process.env.AI_API_KEY.trim());
    return {
      provider: runtimeConfig.provider,
      model: runtimeConfig.model,
      timeoutMs: runtimeConfig.timeoutMs,
      maxRetries: runtimeConfig.maxRetries,
      externalKeyConfigured: hasKey,
      supportedProviders: SUPPORTED_PROVIDERS,
      status:
        runtimeConfig.provider === 'gricc-deterministic' || hasKey
          ? 'READY'
          : 'UNCONFIGURED_KEY',
    };
  },

  updateConfig({ provider, model, timeoutMs }) {
    if (provider !== undefined) {
      if (!SUPPORTED_PROVIDERS.includes(provider)) {
        throw createHttpError(400, `Unsupported provider. Must be one of: ${SUPPORTED_PROVIDERS.join(', ')}`, 'ValidationError');
      }
      runtimeConfig.provider = provider;
    }
    if (model !== undefined && String(model).trim()) {
      runtimeConfig.model = String(model).trim().slice(0, 80);
    }
    if (timeoutMs !== undefined) {
      const ms = Number(timeoutMs);
      if (!Number.isFinite(ms) || ms < 1000 || ms > 60000) {
        throw createHttpError(400, 'timeoutMs must be between 1000 and 60000.', 'ValidationError');
      }
      runtimeConfig.timeoutMs = Math.round(ms);
    }
    return this.getConfig();
  },

  async generateSynthesis({ systemPrompt, userPrompt, deterministicFallback }) {
    const cfg = this.getConfig();
    if (cfg.provider === 'gricc-deterministic') {
      return {
        text: deterministicFallback(),
        provider: cfg.provider,
        model: cfg.model,
        tier: 'ANALYTICAL_ASSESSMENT',
      };
    }

    const text = await callExternalProvider({ systemPrompt, userPrompt, config: cfg });
    if (!text || !text.trim()) {
      throw createHttpError(502, 'AI provider returned an empty response.', 'ProviderError');
    }
    return {
      text: text.trim(),
      provider: cfg.provider,
      model: cfg.model,
      tier: 'AI_INTERPRETATION',
    };
  },
};

