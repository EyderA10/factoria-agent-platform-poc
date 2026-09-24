import { createHmac, timingSafeEqual } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Post-call webhook entrante de ElevenLabs → FactorIA (logs / analítica / coste).
 *
 * ElevenLabs firma cada evento con HMAC-SHA256 — header `elevenlabs-signature`
 * con el formato `t=<timestamp>,v0=<hmac hex del body>` (tolerancia 30 min).
 * El secret se configura en ELEVENLABS_WEBHOOK_SECRET (variable de entorno).
 *
 * Eventos manejados (logging estructurado, no bloquea la conversación):
 *   - post_call_transcription -> transcripción + análisis + coste al terminar el análisis
 *   - agent_tool_response*    -> qué tool llamó el agente y con qué payload
 *   - conversation_ended      -> fin de conversación (+ metadata.cost si viene)
 *   - resto                   -> se loguea y se descarta
 */

const SIGNATURE_HEADER = "elevenlabs-signature";
const TOLERANCE_MS = 30 * 60 * 1000;

function computeSignature(secret: string, timestamp: string, rawBody: string): string {
  const hmac = createHmac("sha256", secret);
  hmac.update(`${timestamp}.${rawBody}`);
  return `v0=${hmac.digest("hex")}`;
}

function safeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a, "utf8");
  const bufB = Buffer.from(b, "utf8");
  return bufA.length === bufB.length && timingSafeEqual(bufA, bufB);
}

export async function POST(req: NextRequest) {
  const secret = process.env.ELEVENLABS_WEBHOOK_SECRET;
  if (!secret) {
    return NextResponse.json(
      {
        error: "not_configured",
        hint: "Configura ELEVENLABS_WEBHOOK_SECRET y luego activa el post-call webhook a nivel de workspace en ElevenLabs.",
      },
      { status: 503 }
    );
  }

  const rawBody = await req.text();
  const signatureHeader = req.headers.get(SIGNATURE_HEADER);

  if (!signatureHeader) {
    return NextResponse.json({ error: "invalid_signature", detail: "missing signature header" }, { status: 400 });
  }

  const parts = signatureHeader.split(",");
  const timestamp = parts.find((p) => p.startsWith("t="))?.slice(2);
  const signature = parts.find((p) => p.startsWith("v0="));

  if (!timestamp || !signature) {
    return NextResponse.json({ error: "invalid_signature", detail: "no v0/t signature scheme" }, { status: 400 });
  }

  const tsMs = Number(timestamp) * 1000;
  if (!Number.isFinite(tsMs) || Date.now() - tsMs > TOLERANCE_MS || tsMs - Date.now() > 60_000) {
    return NextResponse.json({ error: "invalid_signature", detail: "timestamp fuera de tolerancia" }, { status: 400 });
  }

  const expected = computeSignature(secret, timestamp, rawBody);
  if (!safeEqual(expected, signature)) {
    return NextResponse.json({ error: "invalid_signature", detail: "hmac mismatch" }, { status: 400 });
  }

  let event: Record<string, unknown>;
  try {
    event = JSON.parse(rawBody) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "invalid_payload", detail: "body no es JSON" }, { status: 400 });
  }

  const type = typeof event.type === "string" ? event.type : "unknown";
  const conversationId = typeof event.conversation_id === "string" ? event.conversation_id : undefined;
  const metadata = (event.metadata ?? {}) as Record<string, unknown>;

  switch (type) {
    case "post_call_transcription": {
      const data = (event.data ?? {}) as Record<string, unknown>;
      const dataMeta = (data.metadata ?? {}) as Record<string, unknown>;
      const transcript = Array.isArray(data.transcript) ? (data.transcript as { role?: string; message?: string }[]) : [];
      const cost = dataMeta.cost ?? (data as { cost?: unknown }).cost ?? metadata.cost ?? null;
      const firstUser = transcript.find((m) => m.role === "user")?.message ?? "";
      const agentMsgs = transcript.filter((m) => m.role === "agent").length;
      console.log(
        `[ElevenLabs-inbound] post_call_transcription conv=${(data.conversation_id as string) ?? conversationId ?? "-"} status=${(data.status as string) ?? "-"} lines=${transcript.length} (agente=${agentMsgs}) cost=${JSON.stringify(cost ?? null)} user="${firstUser.slice(0, 120)}"`
      );
      break;
    }
    case "agent_tool_response":
    case "agent_tool_response_full_payload":
      console.log(
        `[ElevenLabs-inbound] tool_response conv=${conversationId ?? "-"} tool=${(event.tool_name as string) ?? "-"} payload=${JSON.stringify(event.tool_call_args ?? event)}`
      );
      break;
    case "conversation_ended":
      console.log(
        `[ElevenLabs-inbound] conversation_ended conv=${conversationId ?? "-"} cost=${JSON.stringify(metadata.cost ?? null)} status=${(event.status as string) ?? "-"}`
      );
      break;
    case "conversation_initiation_metadata_event":
      console.log(`[ElevenLabs-inbound] initiated conv=${conversationId ?? "-"} agent_id=${(event.agent_id as string) ?? "-"}`);
      break;
    default:
      console.log(`[ElevenLabs-inbound] ${type} conv=${conversationId ?? "-"}`);
  }

  return NextResponse.json({ ok: true });
}