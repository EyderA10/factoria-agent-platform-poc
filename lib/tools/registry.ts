import { tool } from "ai";
import { checkAvailability, checkAvailabilityInputSchema } from "./check-availability";

/**
 * Registry de la FactorIA Tool Layer para agentes internos (Vercel AI SDK).
 *
 * Mismo schema/contrato que usa el agente de ElevenLabs vía webhook tool:
 * `lib/tools/check-availability.ts` es el single source of truth.
 *
 * Uso:
 *   import { factoriaTools } from "@/lib/tools";
 *   const { text } = await generateText({ model, tools: factoriaTools, prompt });
 */
export const factoriaTools = {
  check_availability: tool({
    description:
      "Consulta disponibilidad, precios y horarios de entradas para un tenant de FactorIA. " +
      "Úsala cuando el usuario pregunte por disponibilidad, precio u horarios de tickets.",
    inputSchema: checkAvailabilityInputSchema,
    execute: async (args) => checkAvailability(args),
  }),
};

export type FactoriaToolName = keyof typeof factoriaTools;