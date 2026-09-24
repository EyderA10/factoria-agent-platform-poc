import { z } from "zod";

/**
 * Contrato de entrada de la tool `check_availability`.
 * Single source of truth: usado por el endpoint HTTP (webhook tool de ElevenLabs)
 * y reutilizable como `tool()` de Vercel AI SDK / agentes internos.
 */
export const checkAvailabilityInputSchema = z.object({
  tenant_id: z.string().min(1).describe("Identificador del cliente/tenant FactorIA").default("default-tenant"),
  user_name: z.string().min(1).describe("Nombre del usuario final, para personalizar la respuesta").default("Visitante"),
  date: z.string().min(1).describe("Fecha de la consulta de disponibilidad (p.ej. 'hoy', '2026-10-05')").default("hoy"),
  category: z
    .enum(["general", "premium", "vip"])
    .describe("Categoría de entrada consultada"),
});

export type CheckAvailabilityInput = z.infer<typeof checkAvailabilityInputSchema>;

export type CheckAvailabilityParseResult =
  | { ok: true; input: CheckAvailabilityInput }
  | { ok: false; reason: "invalid_json" | "validation_failed"; details?: unknown };

/** Parse del body recibido (desde ElevenLabs o desde la UI de prueba). */
export function parseCheckAvailability(body: string | unknown): CheckAvailabilityParseResult {
  let raw: unknown = body;
  if (typeof raw === "string") {
    try {
      raw = JSON.parse(raw);
    } catch {
      return { ok: false, reason: "invalid_json" };
    }
  }
  const parsed = checkAvailabilityInputSchema.safeParse(raw);
  if (!parsed.success) {
    return { ok: false, reason: "validation_failed", details: parsed.error.flatten() };
  }
  return { ok: true, input: parsed.data };
}

export interface CheckAvailabilityData {
  message: string;
  available: boolean;
  price_per_ticket: string;
  available_slots: string[];
  tenant_context: string;
  category: string;
  date: string;
}

/** Lógica de negocio (FactorIA Business Layer). Puro y testeable, sin dependencias de framework. */
export function checkAvailability(rawInput: CheckAvailabilityInput): CheckAvailabilityData {
  const { tenant_id, user_name, date, category } = rawInput;

  const PRICES: Record<CheckAvailabilityInput["category"], number> = {
    general: 15,
    premium: 25,
    vip: 35,
  };

  const SLOTS: Record<CheckAvailabilityInput["category"], string[]> = {
    general: ["10:00 AM", "12:30 PM", "04:00 PM", "06:30 PM"],
    premium: ["11:00 AM", "02:00 PM", "05:00 PM"],
    vip: ["12:00 PM", "07:00 PM"],
  };

  const priceUSD = PRICES[category];
  const availableSlots = SLOTS[category];

  return {
    message: `Hola ${user_name}, hay disponibilidad confirmada para el ${date} en la categoría ${category}.`,
    available: true,
    price_per_ticket: `${priceUSD} USD`,
    available_slots: availableSlots,
    tenant_context: tenant_id,
    category,
    date,
  };
}