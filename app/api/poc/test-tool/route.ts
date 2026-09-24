import { NextRequest, NextResponse } from "next/server";
import { checkAvailability, parseCheckAvailability } from "@/lib/tools/check-availability";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Endpoint de DEMOSTRACIÓN para la landing page: ejecuta exactamente la misma
 * lógica de la FactorIA Tool Layer sin exponer el secreto al navegador.
 * Solo para la UI de prueba del POC; el agente de ElevenLabs usa siempre el
 * endpoint autenticado /api/tools/check-availability.
 */
export async function POST(req: NextRequest) {
  const parsed = parseCheckAvailability(await req.text());

  if (!parsed.ok) {
    return NextResponse.json(
      { error: "Invalid payload", reason: parsed.reason, details: parsed.details },
      { status: 400 }
    );
  }

  return NextResponse.json({ success: true, data: checkAvailability(parsed.input) });
}