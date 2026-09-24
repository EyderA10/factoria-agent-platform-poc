# FactorIA Tool Layer — diseño y contrato

> Punto único donde FactorIA integra el agente de ElevenLabs con los sistemas del cliente
> (ERP, BBDD, disponibilidad, CRM…) y reutiliza la misma lógica en agentes internos.

## 1. Contrato de tool (webhook)

- **Método**: `POST` (acciones con efecto), `GET` (consultas).
- **Auth**: el servidor espera `Authorization: Bearer <FACTORIA_TOOL_SECRET>` (valor aleatorio, en `.env`).
  En ElevenLabs el webhook tool **no** guarda el literal: referencia el secret del workspace por
  **`secret_id`** y ElevenLabs inyecta el valor en el header al llamar.
- **Body**: JSON validado con **Zod** (schema es el contrato; probar contra `lib/tools/check-availability.ts`).
- **Respuesta**: `200 { success: true, data: ... }` o `400/401/422` con `{ success: false, error }`.

Este POC implementa el auth del webhook tool con selector de secretos (`scripts/setup-agent.ts` →
`ensureToolSecret` + `toolApiSchema(endpoint, secretId)`), de modo que el Bearer nunca aparece en la config:

```bash
curl -X POST http://localhost:3000/api/tools/check-availability \
  -H "Authorization: Bearer dev-secret-change-me" \
  -H "Content-Type: application/json" \
  -d '{"tenant_id":"bibo","user_name":"Ana","date":"2026-09-23","category":"premium"}'
```

En el agente (webhook tool) se define `apiSchema` (SDK camelCase):

```json
{
  "url": "https://<factorIA>/api/tools/check-availability",
  "method": "POST",
  "requestHeaders": { "Authorization": { "secretId": "<id>" } },
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

> El secret `FACTORIA_TOOL_SECRET` se almacena en el workspace de ElevenLabs con valor
> `Bearer <token>` (el header completo); el `secret_id` (p.ej. `AbldT6V…`) es lo único que queda en la config.

## 2. Estructura de código en la POC

```
app/api/tools/check-availability/route.ts  → webhook (auth + zod + handler)
lib/tools/check-availability.ts            → schema zod + handler (lógica pura)
lib/tools/registry.ts                      → tools como `tool()` de Vercel AI SDK (registry)
lib/tools/index.ts                         → re-exporta el registry
app/api/poc/test-tool/route.ts             → mismo handler SIN exponer secret (demo UI)
scripts/setup-agent.ts                     → ELEVA el contrato a ElevenLabs (tool + agente + secret)
app/api/webhooks/elevenlabs/route.ts       → post-call entrante con verificación HMAC
```

## 3. Reutilización con Vercel AI SDK

El mismo schema Zod y handler sirven para definir `tools: { check_availability: tool({...}) }`
en `generateText`/`streamText` de Vercel AI SDK (Next.js), sin duplicar la lógica:

```ts
import { tool } from "ai";
import { checkAvailability } from "@/lib/tools/check-availability";

const checkAvailabilityTool = tool({
  description: "Consulta disponibilidad de entradas del cliente.",
  inputSchema: checkAvailabilitySchema, // el MISMO schema (ai v7 usa inputSchema)
  execute: async (args) => checkAvailability(args),
});
```

> En Vercel AI SDK v7 el campo es **`inputSchema`** (antiguo `parameters` quedó obsoleto).

Beneficios: un solo contrato → el agente de ElevenLabs y los agentes internos (p.ej. Vercel Eve)
comparten exactamente las mismas tools, validaciones y mensajes de error.

## 4. Registry (implementado)

`lib/tools/registry.ts` expone las tools como `tool()` de Vercel AI SDK y el tipo `FactoriaToolName`
(unión de ids). Cada tool conserva su **description** y **handler**; el contrato Zod vive en su
propio fichero y se comparte con el endpoint HTTP. Para añadir una tool: crear `lib/tools/<x>.ts`
(schema + handler) y registrarla en `lib/tools/registry.ts` bajo `factoriaTools`.

## 5. Seguridad de tool layer

1. `FACTORIA_TOOL_SECRET` **solo** en variables de entorno del backend; en ElevenLabs solo el select de secretos (`secret_id`).
2. En desarrollo `?skipAuth=1` **solo** cuando `NODE_ENV === "development"` (nunca en producción).
3. Zod en el borde (`route.ts`) rechaza payloads inválidos antes del handler.
4. Post-call webhooks entrantes: verificar HMAC `ElevenLabs-Signature`. Permitir solo egress ElevenLabs.