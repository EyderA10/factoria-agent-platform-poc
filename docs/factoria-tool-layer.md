# FactorIA Tool Layer — diseño y contrato

> Punto único donde FactorIA integra el agente de ElevenLabs con los sistemas del cliente
> (ERP, BBDD, disponibilidad, CRM…) y reutiliza la misma lógica en agentes internos.

## 1. Contrato de tool (webhook)

- **Método**: `POST` (acciones con efecto), `GET` (consultas).
- **Auth**: header `Authorization: Bearer <FACTORIA_TOOL_SECRET>` (valor aleatorio, se define en `.env`).
- **Body**: JSON validado con **Zod** (schema es el contrato; probar contra `lib/tools/check-availability.ts`).
- **Respuesta**: `200 { success: true, data: ... }` o `400/401/422` con `{ success: false, error }`.

Ejemplo (este POC):

```bash
curl -X POST http://localhost:3000/api/tools/check-availability \
  -H "Authorization: Bearer dev-secret-change-me" \
  -H "Content-Type: application/json" \
  -d '{"tenant_id":"bibo","user_name":"Ana","date":"2026-09-23","category":"premium"}'
```

En el agente (webhook tool) se define `apiSchema`:

```json
{
  "url": "https://<factorIA>/api/tools/check-availability",
  "method": "POST",
  "requestHeaders": { "Authorization": "Bearer <secret>" },
  "requestBodySchema": {
    "type": "object",
    "properties": {
      "tenant_id": { "type": "string", "description": "Id del cliente" },
      "user_name": { "type": "string", "description": "Nombre del usuario" },
      "date": { "type": "string", "description": "Fecha (YYYY-MM-DD)" },
      "category": { "type": "string", "enum": ["general", "premium", "vip"] }
    },
    "required": ["category"]
  }
}
```

## 2. Estructura de código en la POC

```
app/api/tools/check-availability/route.ts  → webhook (auth + zod + handler)
lib/tools/check-availability.ts            → schema zod + handler (lógica pura)
app/api/poc/test-tool/route.ts             → mismo handler SIN exponer secret (demo UI)
scripts/setup-agent.ts                     → ELEVA el contrato a ElevenLabs (tool + agente)
```

## 3. Reutilización con Vercel AI SDK

El mismo schema Zod y handler sirven para definir `tools: { check_availability: tool({...}) }`
en `generateText`/`streamText` de Vercel AI SDK (Next.js), sin duplicar la lógica:

```ts
import { tool } from "ai";
import { z } from "zod";
import { checkAvailability } from "@/lib/tools/check-availability";

const checkAvailabilityTool = tool({
  description: "Consulta disponibilidad de entradas del cliente.",
  parameters: checkAvailabilitySchema, // el MISMO schema
  execute: async (args) => checkAvailability(args),
});
```

Beneficios: un solo contrato → el agente de ElevenLabs y los agentes internos (p.ej. Vercel Eve)
comparten exactamente las mismas tools, validaciones y mensajes de error.

## 4. Registry (próximo paso, orientación)

| Campo | Tipo | Ejemplo |
|---|---|---|
| `id` | string | `check_availability` |
| `description` | string | «Disponibilidad de entradas del cliente» |
| `method` | `GET` / `POST` | `POST` |
| `requestBodySchema` | JSON Schema | véase §1 |
| `auth` | `bearer` / `mcp` / `none` | `bearer` |
| `handler` | función | `checkAvailability(args)` |
| `cadence` / `rate_limit` | opcional | — |

## 5. Seguridad de tool layer

1. `FACTORIA_TOOL_SECRET` **solo** en variables de entorno del backend y como `secret_key` de ElevenLabs.
2. En desarrollo `?skipAuth=1` **solo** cuando `NODE_ENV === "development"` (nunca en producción).
3. Zod en el borde (`route.ts`) rechaza payloads inválidos antes del handler.
4. Post-call webhooks entrantes: verificar HMAC `ElevenLabs-Signature`. Permitir solo egress ElevenLabs.