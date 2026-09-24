## 1. Lista de revisión y prueba solicitada

| Tema solicitado | Estado | Observación / alcance logrado |
|---|---|---|
| WhatsApp y requisitos de onboarding del cliente | ✅ Revisado · ⏳ credenciales | Import WABA con cuenta de Meta/Facebook (admin), nº sin uso previo, plantillas aprobadas; real pendiente de credenciales de Bibo |
| Telefonía: números, Twilio, SIP, inbound/outbound y transferencias | ✅ Revisado · ⏳ credenciales | Twilio recomendado (integración nativa + SMS); SIP (Vonage, Telnyx, Plivo, Exotel, Bandwidth); endpoint outbound implementado; llamada real pendiente de número/billing |
| Web chat, widget y SDK | ✅ Probado | Widget propio de FactorIA (voz + chat) sobre `@elevenlabs/react`; demo en producción |
| SDK de ElevenLabs React/Next.js y UI propia de FactorIA | ✅ Probado | Widget propio reutilizable (`factoria-chat-widget`), SDK v1.15.2 |
| Creación/configuración de agentes por cliente | ✅ Probado (mecanismo por cliente) | `scripts/setup-agent.ts` con `--client <id>` (config en `scripts/clients/<id>.json`: prompt, tool, secret, voz, post-call; idempotente); validado E2E con Bibo |
| Webhook tools y autenticación | ✅ Validado E2E | Tool webhook con selector de secretos (sin literales); agente → tool → datos reales |
| Variables dinámicas, sesiones e identificación usuario/canal | ✅ Revisado | `userId` + `dynamicVariables` en web; identificación por canal documentada |
| Knowledge Base | ⏳ Requiere datos de Bibo | Proceso documentado; KB real depende de documentación del cliente |
| Human handoff | ✅ Revisado · ⏳ dato | System tool «Transfer to number»; falta número destino de Bibo |
| Logs, analytics, costes y limitaciones | ✅ Validado E2E | Post-call webhook con HMAC registra transcripción y coste real (microcréditos); limitaciones en `elevenlabs-capabilities.md` |
| Qué se administra por API vs manual | ✅ Documentado | Matriz completa en `elevenlabs-capabilities.md` |

## 2. Entregables

| Entregable solicitado | Estado | Dónde está |
|---|---|---|
| Spike/POC funcionando | ✅ Entregado | Demo en producción https://factoria-agent-platform-poc.vercel.app · agente real + tool validada E2E |
| Breve actualización de la arquitectura | ✅ Entregado | `docs/architecture-update.md` |
| Checklist de onboarding Web · WhatsApp · telefonía | ✅ Entregado | `docs/onboarding-checklist.md` (§6–§8) |
| Diseño inicial de la FactorIA Tool Layer | ✅ Entregado | `docs/factoria-tool-layer.md` + `lib/tools/` (Zod, auth, endpoint) |
| Propuesta de integración frontend/UI reutilizable | ✅ Entregado | Widget propio `components/factoria-chat-widget.tsx` |
| Qué partes de ElevenLabs se administran vía API/SDK | ✅ Entregado | `docs/elevenlabs-capabilities.md` (matriz §1, SDK §3) |
| Información/accesos posteriores de Bibo Park One | ✅ Entregado | `docs/bibo-park-requirements.md` §4 + checklist de onboarding |

## 3. Prueba recomendada (1 min)

Abrir la demo, activar el micrófono y decir:

> «Hola, ¿hay disponibilidad vip para mañana? Dame precio y horarios.»

Respuesta esperada: *VIP a 35 USD · horarios 12:00 PM y 07:00 PM* (datos reales, no inventados).