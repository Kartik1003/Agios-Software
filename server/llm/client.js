// server/llm/client.js
// Dual-Provider LLM Client — OpenRouter + Groq combined fallback cascade.
// If all OpenRouter models fail, automatically falls through to Groq models.

import { OpenAI } from 'openai';
import dotenv from 'dotenv';
dotenv.config();

// ─────────────────────────────────────────────
// Provider Clients (lazy-initialized singletons)
// ─────────────────────────────────────────────

let openrouterClient = null;
let groqClient = null;

function getOpenRouterClient() {
  if (!openrouterClient) {
    const key = process.env.OPENROUTER_API_KEY;
    if (!key) return null;
    openrouterClient = new OpenAI({
      apiKey: key,
      baseURL: 'https://openrouter.ai/api/v1',
      defaultHeaders: {
        'HTTP-Referer': process.env.SERVER_PUBLIC_URL || `http://localhost:${process.env.PORT || 3002}`,
        'X-Title': 'Agios Pipeline',
      },
    });
  }
  return openrouterClient;
}

function getGroqClient() {
  if (!groqClient) {
    const key = process.env.GROQ_API_KEY;
    if (!key) return null;
    groqClient = new OpenAI({
      apiKey: key,
      baseURL: 'https://api.groq.com/openai/v1',
    });
  }
  return groqClient;
}

// ─────────────────────────────────────────────
// Unified Model Registry
// Each entry: { model, provider, maxTokens, supportsJsonMode }
// All IDs verified against live OpenRouter API (May 2026)
// ─────────────────────────────────────────────

const MODEL_CASCADE = [
  // ── OpenRouter Free Tier (verified from live API) ──
  // owl-alpha: free (pricing: 0), supports response_format, structured_outputs (Fastest + JSON Mode)
                    //  provider: 'openrouter', maxTokens: 8192,  supportsJsonMode: true  },
  
  // nemotron omni supports: include_reasoning, reasoning, seed, temperature, tool_choice, tools (NO response_format)
  { model: 'nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free',   provider: 'openrouter', maxTokens: 8192,  supportsJsonMode: false },
  
  // poolside laguna supports reasoning, tool_choice, tools (NO response_format)
  { model: 'poolside/laguna-m.1:free',                             provider: 'openrouter', maxTokens: 8192,  supportsJsonMode: false },
  { model: 'poolside/laguna-xs.2:free',                            provider: 'openrouter', maxTokens: 8192,  supportsJsonMode: false },
  
  // deepseek-v4-flash supports: include_reasoning, reasoning, tool_choice, tools (Moved to end due to slow inference)
  { model: 'deepseek/deepseek-v4-flash:free',                      provider: 'openrouter', maxTokens: 8192,  supportsJsonMode: false },

  // ── Groq (separate provider, separate rate limits) ──
  { model: 'llama-3.3-70b-versatile',  provider: 'groq', maxTokens: 4000, supportsJsonMode: true },
  { model: 'llama-3.1-8b-instant',     provider: 'groq', maxTokens: 2000, supportsJsonMode: true },
];

function getClientForProvider(provider) {
  if (provider === 'openrouter') return getOpenRouterClient();
  if (provider === 'groq') return getGroqClient();
  return null;
}

// ─────────────────────────────────────────────
// Main LLM Call — Dual-Provider Fallback
// ─────────────────────────────────────────────

/**
 * Call the LLM with a system prompt and user message.
 * Cascades through OpenRouter models first, then Groq models.
 * Expects the LLM to return valid JSON.
 *
 * @param {string} systemPrompt - The system-level instruction
 * @param {string} userMessage - The user-level input
 * @param {object} [options]
 * @returns {Promise<object>} Parsed JSON object from LLM response
 */
export async function callLLM(systemPrompt, userMessage, options = {}) {
  const temperature = options.temperature ?? 0.3;
  const maxRetries = options.maxRetries ?? 1;

  // Build the cascade: primary model (if set) first, then the full list
  const primaryModel = options.model || process.env.OPENROUTER_MODEL;
  let cascade = [...MODEL_CASCADE];

  // If user specified a primary model, prepend it
  if (primaryModel) {
    const isGroqModel = !primaryModel.includes('/');
    cascade.unshift({
      model: primaryModel,
      provider: isGroqModel ? 'groq' : 'openrouter',
      maxTokens: options.maxTokens ?? 8192,
    });
  }

  // Deduplicate by model name
  const seen = new Set();
  cascade = cascade.filter(entry => {
    if (seen.has(entry.model)) return false;
    seen.add(entry.model);
    return true;
  });

  let lastError = null;

  for (const entry of cascade) {
    const { model, provider, maxTokens } = entry;
    const client = getClientForProvider(provider);

    if (!client) {
      console.warn(`[LLM] Skipping ${model} — no API key configured for ${provider}`);
      continue;
    }

    console.log(`[LLM] Attempting request with ${provider.toUpperCase()} model: ${model}`);

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        const enhancedSystemPrompt = attempt === 0
          ? systemPrompt
          : `${systemPrompt}\n\nIMPORTANT: Your previous response was not valid JSON. You MUST respond with ONLY a valid JSON object matching the requested schema. No markdown fences, no prose, no explanation outside the JSON.`;

        const requestParams = {
          model,
          messages: [
            { role: 'system', content: enhancedSystemPrompt },
            { role: 'user', content: userMessage },
          ],
          temperature,
          max_tokens: maxTokens,
        };

        // Only add response_format for models that explicitly support it
        if (entry.supportsJsonMode) {
          requestParams.response_format = { type: 'json_object' };
        }

        const response = await client.chat.completions.create(requestParams);

        const content = response.choices[0]?.message?.content;
        if (!content) {
          throw new Error('Empty response from LLM');
        }

        // Parse JSON — strip markdown fences and any text before/after JSON
        let cleaned = content.trim();
        
        // Strip markdown fences
        if (cleaned.startsWith('```')) {
          cleaned = cleaned.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '');
        }

        // Try to extract JSON object if there's extra text around it
        if (!cleaned.startsWith('{') && !cleaned.startsWith('[')) {
          const jsonStart = cleaned.indexOf('{');
          const jsonEnd = cleaned.lastIndexOf('}');
          if (jsonStart !== -1 && jsonEnd !== -1) {
            cleaned = cleaned.substring(jsonStart, jsonEnd + 1);
          }
        }

        let parsed;
        try {
          parsed = JSON.parse(cleaned);
        } catch (parseErr) {
          parseErr.rawContent = content;
          parseErr.finishReason = response.choices[0]?.finish_reason;
          throw parseErr;
        }

        console.log(`[LLM] ✓ Success with ${provider.toUpperCase()} model: ${model}`);
        return parsed;

      } catch (err) {
        lastError = err;

        // Errors that should immediately switch to next model (no retry)
        const status = err.status || 0;
        const msg = err.message || '';
        const isRateLimit = status === 429 || msg.includes('429') || msg.includes('Rate limit');
        const isContextTooLarge = status === 413 || msg.includes('413') || msg.includes('too large');
        const isNotFound = status === 404 || msg.includes('No endpoints found') || msg.includes('not found');
        const isInvalidModel = msg.includes('not a valid model') || msg.includes('decommissioned') || msg.includes('does not exist');
        const isProviderError = status === 502 || status === 503 || msg.includes('Provider returned error');
        const isBadRequest = status === 400 && (isInvalidModel || msg.includes('not a valid'));

        if (isRateLimit || isContextTooLarge || isNotFound || isBadRequest || isProviderError) {
          console.warn(`[LLM] ${provider.toUpperCase()} model ${model} failed (${status || 'error'}): ${msg}. Switching to next model...`);
          break; // Move to next model in cascade
        }

        // Retryable errors (JSON parse failures, etc.)
        if (attempt < maxRetries) {
          console.warn(`[LLM] Attempt ${attempt + 1} failed for ${model}: ${msg}. Retrying...`);
          continue;
        }

        // Max retries exhausted for this model, move to next
        console.warn(`[LLM] ${model} exhausted all retries. Switching to next model...`);
      }
    }
  }

  throw new Error(`LLM call failed after trying all models across all providers. Last error: ${lastError?.message}`);
}
