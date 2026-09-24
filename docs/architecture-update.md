# FactorIA Agent Platform — Actualización de Arquitectura (POC)

> Estado: validado a nivel técnico con la documentación oficial de ElevenLabs (Agents,
> Webhook Tools, Widget, SDK React, Twilio/SIP, WhatsApp, signed URLs, post-call webhooks).
> Fase 1 aplicada y verificada de extremo a extremo: webhook tool con auth por **selector de
> secretos**, y **post-call webhook** activo en el workspace con evento real `post_call_transcription`
> recibido y validado por HMAC.

## 1. Flujo objetivo

```
Web [React SDK + signed URL] ─┐
WhatsApp [Meta WABA → ElevenLabs] ├─► ElevenLabs Conversational AI
Phone [Twilio / SIP → ElevenLabs] ─┘   (STT · LLM · TTS · WebRTC)
                                             │  webhook tool (HTTP POST + Bearer)
                                             ▼
                              ┌─────────────────────────────┐
                              │  FactorIA Tool Layer         │
                              │  (Next.js: Zod · Auth · API) │
                              └───────┬──────────┬───────────┘
                                      │          │
                    tools reutilizables│          │mismos zod-schemas
                    (agente ElevenLabs)│          │como tool() de Vercel AI SDK
                                      ▼          ▼
                            Sistemas/Apps       Agentes internos
                            del cliente         (Vercel Eve / AI SDK)
                                      │
                                      ▼
   ←── post-call webhooks (HMAC): transcript, análisis, coste → FactorIA (logs/CRM)
```

Puntos validados del correo:

- **ElevenLabs actúa como infraestructura** (agente, STT/TTS, telefonía, WhatsApp). FactorIA conserva la
  experiencia (UI propia), la integración (tools) y la lógica del cliente.
- **FactorIA Tool Layer es el punto único de contrato**: un mismo endpoint + schema Zod sirve al agente
  de ElevenLabs (vía webhook tool) y a los agentes internos (vía Vercel AI SDK).
- **Telefonía**: números Twilio importados (comprados o *verified caller IDs*), SIP trunking (Vonage, Telnyx, Plivo,
  Bandwidth, Exotel), inbound asignando agente al número, outbound vía API, transferencias vía system tool
  «Transfer to number».
- **WhatsApp**: se conecta el WhatsApp Business existente (import vía Meta WABA); el agente responde textos y
  notas de voz. Outbound solo con templates aprobados por Meta.
- **Web**: widget oficial (`<elevenlabs-convai>`) para inicio inmediato O widget propio de FactorIA sobre
  `@elevenlabs/react` (este POC implementa el propio).

## 2. Seguridad

| Flujo | Mecanismo |
|---|---|
| Agente → FactorIA Tool Layer | Header `Authorization: Bearer <secret>` resuelto por **selector de secretos** de ElevenLabs (`request_header` con `secret_id`); el literal nunca queda en la config. |
| Post-call webhooks → FactorIA | HMAC `ElevenLabs-Signature` firmado manualmente (`t=`/`v0=`, tolerancia 30 min) en `app/api/webhooks/elevenlabs` con `ELEVENLABS_WEBHOOK_SECRET` + IP egress allowlist. |
| Navegador → ElevenLabs | Agente público (allowlist de dominio) **o** signed URL efímera generada server-side. Nunca exponer `xi-api-key`. |
| Identificación de usuario/sesión | Web: `userId` + `dynamicVariables` en `startSession`. WhatsApp inbound: initialization context / variables dinámicas. Phone inbound: Twilio personalization webhook. |

## 3. Decisiones de la POC

1. **Widget propio (no el hosted)**: demuestra que FactorIA puede construir su propia UI (requisito del correo).
2. **Endpoint único `POST /api/tools/check-availability`** como webhook tool.
3. **Provisioning vía API**: `scripts/setup-agent.ts` crea tool + agente de forma idempotente (`--dry-run` para auditar).
4. **Post-call webhooks activos**: `app/api/webhooks/elevenlabs` verifica HMAC y registra
   transcripción/coste; el webhook de workspace se crea/ata con `npm run setup -- --enable-webhook`
   (evento `transcript`). Validado con un evento real (`post_call_transcription` → `cost` en microcréditos).
5. **Multi-tenant**: `tenant_id` viaja en el payload de la tool; en producción se resuelve además por agente/entorno por cliente.