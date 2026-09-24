import { ElevenLabsClient } from "@elevenlabs/elevenlabs-js";

/**
 * Utilidades server-side de ElevenLabs.
 * IMPORTANTE: este módulo solo debe importarse desde Server Components / API Routes.
 * Nunca exponga ELEVENLABS_API_KEY al navegador.
 */

export function hasElevenLabsApiKey(): boolean {
  return Boolean(process.env.ELEVENLABS_API_KEY);
}

export function getElevenLabsClient(): ElevenLabsClient {
  const apiKey = process.env.ELEVENLABS_API_KEY;
  if (!apiKey) {
    throw new Error("ELEVENLABS_API_KEY no está configurada. Cópiala desde ElevenLabs → Dashboard → API Keys");
  }
  return new ElevenLabsClient({ apiKey });
}

export interface SessionForAgent {
  mode: "public_agent" | "signed_url";
  agentId?: string;
  signedUrl?: string;
}

/** Genera un signed URL (agentes privados) o devuelve el agentId (agentes públicos). */
export async function sessionForAgent(requestedAgentId?: string): Promise<SessionForAgent> {
  const agentId = requestedAgentId ?? process.env.NEXT_PUBLIC_ELEVENLABS_AGENT_ID;
  if (!agentId) {
    throw new Error("agent_id_required");
  }

  if (!hasElevenLabsApiKey()) {
    return { mode: "public_agent", agentId };
  }

  const response = await getElevenLabsClient().conversationalAi.conversations.getSignedUrl({
    agentId,
    includeConversationId: true,
  });

  return { mode: "signed_url", signedUrl: response.signedUrl };
}