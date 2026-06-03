/**
 * Shared GoogleGenAI client — AI STUDIO primary, VERTEX fallback, on gemini-3.1-pro.
 *
 * Raqeeb 2026-06-03: "run Jin in studio ai 3.1 pro, and fallback as vertex 3.1 pro as well."
 *
 * getGenAI() returns a GoogleGenAI-shaped proxy. Every `.models.generateContent`
 * (and `generateContentStream`) call:
 *   1. is normalised to LEADJIN_MODEL (default gemini-3.1-pro-preview) for gemini
 *      TEXT models — image / tts / embedding / imagen / veo / lyria ids are left as-is;
 *   2. is tried on the AI-Studio key path FIRST (process.env.GEMINI_API_KEY);
 *   3. on ANY error (429 / 5xx / network / quota) transparently RETRIES on Vertex
 *      (service-account, uncapped) with the same params.
 * Every other client surface passes straight through to the primary client.
 *
 * Per-user override: a genuine per-user key (truthy AND != server GEMINI_API_KEY)
 * is used as the primary; it still falls back to Vertex on error.
 *
 * Both legs verified live 2026-06-03: gemini-3.1-pro-preview → PONG on AI Studio AND Vertex.
 */

import { GoogleGenAI } from "@google/genai";

const VERTEX_PROJECT  = process.env.VERTEX_PROJECT_ID  || "gen-lang-client-0609711713";
const VERTEX_LOCATION = process.env.VERTEX_LOCATION    || "global";
const CREDS_PATH      = "/home/euphoria/.creds/vertex-express-gen-lang-client-0609711713.json";
const LEADJIN_MODEL      = process.env.LEADJIN_MODEL      || "gemini-3.1-pro-preview"; // reasoning (Jin's intelligence: buying signal)
const LEADJIN_FAST_MODEL = process.env.LEADJIN_FAST_MODEL || "gemini-2.5-flash";        // utility/enrichment/discovery (fast, Vertex-valid)

// Ensure credentials are visible to the google-auth-library at module load.
if (!process.env.GOOGLE_APPLICATION_CREDENTIALS) {
  process.env.GOOGLE_APPLICATION_CREDENTIALS = CREDS_PATH;
}

let _vertexClient: GoogleGenAI | null = null;
function getVertexClient(): GoogleGenAI {
  if (!_vertexClient) {
    _vertexClient = new GoogleGenAI({
      vertexai: true,
      project:  VERTEX_PROJECT,
      location: VERTEX_LOCATION,
    });
  }
  return _vertexClient;
}

// Map gemini text models by TIER (keeps hunts fast):
//   - a "pro" model  → LEADJIN_MODEL (gemini-3.1-pro-preview)  [reasoning: the buying signal]
//   - flash / lite   → LEADJIN_FAST_MODEL (gemini-2.5-flash)   [discovery + enrichment, Vertex-valid]
// image / tts / embedding / imagen / veo / lyria / aqa ids are never touched.
function normaliseModel(model?: string): string {
  if (!model) return LEADJIN_FAST_MODEL;
  const m = model.toLowerCase();
  if (/(image|tts|embedding|imagen|veo|lyria|aqa)/.test(m)) return model;
  if (m.includes("pro")) return LEADJIN_MODEL;
  if (m.startsWith("gemini-") || m.startsWith("models/gemini-")) return LEADJIN_FAST_MODEL;
  return model;
}

function withModel<T extends { model?: string }>(params: T): T {
  if (!params || typeof params !== "object") return params;
  return { ...params, model: normaliseModel((params as any).model) };
}

// Wrap a primary client: generateContent / generateContentStream get
// model-normalisation + Vertex fallback; everything else passes through.
function wrapWithFallback(primary: GoogleGenAI): GoogleGenAI {
  const modelsProxy = new Proxy((primary as any).models, {
    get(target, prop, recv) {
      if (prop === "generateContent") {
        return async (params: any) => {
          const p = withModel(params);
          try {
            return await target.generateContent(p);
          } catch (err) {
            console.warn(`[genaiClient] AI-Studio primary failed (${String((err as any)?.message || err).slice(0, 80)}) → Vertex fallback on ${p?.model}`);
            return await getVertexClient().models.generateContent(p);
          }
        };
      }
      if (prop === "generateContentStream") {
        return async (params: any) => {
          const p = withModel(params);
          try {
            return await target.generateContentStream(p);
          } catch (err) {
            console.warn(`[genaiClient] AI-Studio primary stream failed → Vertex fallback on ${p?.model}`);
            return await getVertexClient().models.generateContentStream(p);
          }
        };
      }
      const v = Reflect.get(target, prop, recv);
      return typeof v === "function" ? v.bind(target) : v;
    },
  });

  return new Proxy(primary, {
    get(target, prop, recv) {
      if (prop === "models") return modelsProxy;
      const v = Reflect.get(target, prop, recv);
      return typeof v === "function" ? v.bind(target) : v;
    },
  }) as GoogleGenAI;
}

/**
 * Returns a configured GoogleGenAI proxy (AI-Studio primary → Vertex fallback).
 *
 * @param userApiKey A genuine per-user key that DIFFERS from the server env key.
 *                   If absent / falsy / equal to GEMINI_API_KEY, the server
 *                   AI-Studio key is the primary (Vertex on failure).
 */
export function getGenAI(userApiKey?: string): GoogleGenAI {
  const envKey = process.env.GEMINI_API_KEY;
  const isGenuineUserKey = !!userApiKey && userApiKey !== envKey;

  if (isGenuineUserKey) {
    return wrapWithFallback(new GoogleGenAI({ apiKey: userApiKey as string }));
  }
  if (envKey) {
    // AI Studio primary on the server key.
    return wrapWithFallback(new GoogleGenAI({ apiKey: envKey }));
  }
  // No AI-Studio key configured → Vertex is both primary and (no-op) fallback.
  return wrapWithFallback(getVertexClient());
}
