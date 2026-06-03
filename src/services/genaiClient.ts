/**
 * Shared GoogleGenAI client factory.
 *
 * DEFAULT behaviour (LEADJIN_USE_VERTEX not set, or set to "true"):
 *   → Vertex AI via service-account credentials (uncapped, no 429).
 *
 * EXPLICIT opt-out (LEADJIN_USE_VERTEX=false):
 *   → Gemini API key path.
 *
 * Per-user override logic:
 *   Pass a userApiKey ONLY when it is a genuine per-user key (i.e. it is
 *   truthy AND different from the server-level GEMINI_API_KEY). When it is
 *   just the env key being forwarded as a variable, DO NOT pass it — call
 *   getGenAI() with no argument so Vertex is used.
 *
 * Call sites that DO have a real per-user key (e.g. from a decrypted DB row
 * that differs from process.env.GEMINI_API_KEY) may pass it explicitly and
 * will get the apiKey path for that single call.
 */

import { GoogleGenAI } from "@google/genai";

const VERTEX_PROJECT  = process.env.VERTEX_PROJECT_ID  || "gen-lang-client-0609711713";
const VERTEX_LOCATION = process.env.VERTEX_LOCATION    || "global";
const CREDS_PATH      = "/home/euphoria/.creds/vertex-express-gen-lang-client-0609711713.json";

// Ensure credentials are visible to the google-auth-library at module load.
if (!process.env.GOOGLE_APPLICATION_CREDENTIALS) {
  process.env.GOOGLE_APPLICATION_CREDENTIALS = CREDS_PATH;
}

// true  = use Vertex (default when env var is absent or set to "true")
// false = use Gemini API key (explicit opt-out)
const useVertex = process.env.LEADJIN_USE_VERTEX !== "false";

// Singleton Vertex client — reused across all call sites.
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

/**
 * Returns a configured GoogleGenAI instance.
 *
 * @param userApiKey  A genuine per-user key that DIFFERS from the server env
 *                    key. If absent, falsy, or equal to GEMINI_API_KEY, the
 *                    Vertex path is used (regardless of LEADJIN_USE_VERTEX).
 */
export function getGenAI(userApiKey?: string): GoogleGenAI {
  // A "genuine" per-user override is truthy AND differs from the server env key.
  const envKey = process.env.GEMINI_API_KEY;
  const isGenuineUserKey = !!userApiKey && userApiKey !== envKey;

  if (isGenuineUserKey) {
    // Per-user override: honour it with the apiKey path even in vertex mode.
    return new GoogleGenAI({ apiKey: userApiKey });
  }

  if (useVertex) {
    return getVertexClient();
  }

  // Legacy apiKey path (LEADJIN_USE_VERTEX=false).
  return new GoogleGenAI({ apiKey: envKey || "" });
}
