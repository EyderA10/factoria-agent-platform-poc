# POC FactorIA Agent Platform — Estado de validación

> Versión: 2026-09-24 · Fase 1 aplicada
> Alcance de este doc: validar con la empresa qué se probó, cómo hacerlo y qué sigue dependiendo del cliente.

## 1. Entregables propuestos (correo) y su estado

| # | Entregable | Estado en POC | Cómo se validó |
|---|---|---|---|
| 1 | Widget web de **voz** de FactorIA (UI propia sobre `@elevenlabs/react`) | ✅ Probado | Navegador (Chrome/incógnito/celular) + prueba headless WebSocket |
| 2 | Agente de ElevenLabs con la tool de disponibilidad | ✅ Configurado | `GET /v1/convai/agents/…`: `turn_timeout=30`, prompt con reglas 5–8, `tool_ids` correctos |
| 3 | **FactorIA Tool Layer** (endpoint `POST /api/tools/check-availability`) | ✅ Validado E2E | El agente llamó al webhook y respondió con **datos reales** (`vip 35 USD · 12:00 PM · 07:00 PM`); log Vercel del POST |
| 4 | **Registry** con Vercel AI SDK (misma lógica para agentes internos) | ✅ Implementado | `lib/tools/registry.ts` (ai v7, `inputSchema`); `npm run typecheck` limpio |
| 5 | **Post-call webhook** entrante con verificación HMAC | ✅ Backend listo | `app/api/webhooks/elevenlabs`; falta solo activar el envío en el workspace de ElevenLabs |
| 6 | **Secretos**: webhook tool con auth por selector de secretos, sin literales | ✅ Aplicado | `GET /v1/convai/tools/…`: header `Authorization: { secret_id }` (sin token); `ELEVENLABS_WEBHOOK_SECRET` en Vercel (prod/preview/dev) |
| 7 | **Documentación** de arquitectura, capabilities y tool layer | ✅ Actualizada | `docs/architecture-update.md`, `docs/elevenlabs-capabilities.md`, `docs/factoria-tool-layer.md`, `docs/onboarding-checklist.md`, `docs/bibo-park-requirements.md` |

## 2. Cómo reproducir la validación

- **Widget web**: abrir **https://factoria-agent-platform-poc.vercel.app**, activar el micrófono y preguntar por voz:
  > «Hola, ¿hay disponibilidad vip para mañana? Dame precio y horarios.»
  - Respuesta esperada (datos reales, no inventados): *VIP a 35 USD, horarios 12:00 PM y 07:00 PM.*
  - Nota: si el botón de hablar no conecta en un navegador, desactivar extensiones que bloquean WebSocket (verificado: funciona en incógnito y móvil).
- **Prueba headless (sin UI)** vía WebSocket de ElevenLabs → agente → tool → respuesta real.
- **Webhook directo** (para audit-front del contrato):
  ```bash
  curl -X POST https://factoria-agent-platform-poc.vercel.app/api/tools/check-availability \
    -H "Authorization: Bearer $FACTORIA_TOOL_SECRET" \
    -H "Content-Type: application/json" \
    -d '{"tenant_id":"default-tenant","user_name":"Validación","date":"hoy","category":"premium"}'
  ```

## 3. Evidencia técnica de la Fase 1

- Log de Vercel: `200 POST /api/tools/check-availability` con payload del agente (`tenant_id`, `user_name`, `date`, `category`).
- Tool webhook: `url` apunta a producción; `request_headers.Authorization = { secret_id }` (sin token expuesto).
- Secret `FACTORIA_TOOL_SECRET` creado en el workspace de ElevenLabs (valor = `Bearer <token>`, el header completo).
- `ELEVENLABS_WEBHOOK_SECRET` añadido a Vercel como Secret (production/preview/development).
- Comportamiento conversacional ajustado: el agente **no** repite «¿sigues ahí?», responde **una sola vez** y solo pregunta «¿algo más?» **una vez** por turno; tiempo de silencio 30 s con «take turn after silence» anulado desde el widget (`user_activity` cada 10 s).

## 4. Fuera del alcance probado (requiere datos/credenciales del cliente)

| Pendiente | Qué se necesita |
|---|---|
| WhatsApp real (inbound/outbound, voz/texto) | Número WhatsApp Business/Meta WABA + portafolio + templates aprobados |
| Telefonía real (inbound/outbound/transferencia a humano) | Número Twilio/SIP de la empresa + billing |
| Transferencia a humano | Número destino real de Factoria |
| Bases de conocimiento de Bibo | Docs/capacitación en el formato KB de ElevenLabs |
| Post-call webhooks end-to-end (transcript/coste real por llamada) | Activar envío a nivel de workspace en el dashboard de ElevenLabs |

## 5. Recomendación de validación por la empresa

1. Probar el widget en el PC y en un móvil (por voz y por texto) con las preguntas de la tabla de datos.
2. Comprobar que el agente **nunca inventa** precios/horarios y que responde solo mientras haya turno.
3. Revisar la tabla de §4 y proporcionar los datos del cliente para abrir WhatsApp/telefonía reales.