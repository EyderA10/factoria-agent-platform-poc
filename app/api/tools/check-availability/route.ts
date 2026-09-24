import { NextRequest, NextResponse } from "next/server";
import { checkAvailability, parseCheckAvailability } from "@/lib/tools/check-availability";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * FactorIA Tool Layer — Webhook Tool consumida por ElevenLabs Conversational AI.
 *
 * El agente genera dinámicamente el payload { tenant_id, user_name, date, category }
 * a partir de la conversación y llama a este endpoint. La respuesta JSON se
 * inyecta en el contexto del LLM para que responda al usuario de forma natural.
 */
export async function POST(req: NextRequest) {
  try {
    // 1. Autenticación de la llamada (Bearer token configurado en el webhook tool de ElevenLabs)
    const expectedSecret = process.env.FACTORIA_TOOL_SECRET ?? "factoria-secret-token-2026";
    const authHeader = req.headers.get("authorization");
    const allowedLocalSkip = process.env.NODE_ENV !== "production" && req.nextUrl.searchParams.get("skipAuth") === "1";

    if (!allowedLocalSkip && authHeader !== `Bearer ${expectedSecret}`) {
      return NextResponse.json(
        { error: "Unauthorized: invalid FactorIA Tool Secret" },
        { status: 401 }
      );
    }

    // 2. Parseo y validación con Zod
    const rawBody = await req.text();
    const parsed = parseCheckAvailability(rawBody);

    if (!parsed.ok) {
      const status = parsed.reason === "invalid_json" ? 400 : 400;
      return NextResponse.json(
        { error: "Invalid payload", reason: parsed.reason, details: parsed.details },
        { status }
      );
    }

    console.log(
      `[FactorIA Tool Layer] check_availability → tenant=${parsed.input.tenant_id} payload=${JSON.stringify(parsed.input)}`
    );

    // 3. Lógica de negocio
    const data = checkAvailability(parsed.input);

    // 4. Respuesta consumible por el LLM de ElevenLabs
    return NextResponse.json({ success: true, data });
  } catch (error) {
    console.error("[FactorIA Tool Layer] error:", error);
    return NextResponse.json({ error: "Internal tool execution error" }, { status: 500 });
  }
}