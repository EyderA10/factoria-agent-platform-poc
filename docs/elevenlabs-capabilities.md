# Capabilities de ElevenLabs — qué se puede administrar vía API y qué es manual

> Matriz de capacidades verificada contra la documentación oficial (sept. 2026).
> El POC demuestra lo marcado como **✅ con código** en este repositorio.

## 1. Resumen de capacidades por canal

| Capacidad | API / SDK | Manual (dashboard) | Estado en POC |
|---|---|---|---|
| Crear agente (guion, idioma, voz, tools) | ✅ `agents.create` | ✅ | ✅ `scripts/setup-agent.ts` |
| Actualizar agente (guion, tools, voz) | ✅ `agents.update` | ✅ | ✅ (flag `--update-agent`) |
| Convertir borrador a agente | ✅ `agents.convertDraft` | — | ℹ️ alternativa |
| Voz (clonar, estilizar, 29+ idiomas v2, título) | ✅ `voices.*` | ✅ | ⏳ futuro |
| Tool webhook apuntando a tu API | ✅ `tools.create` (webhook) | ✅ | ✅ |
| Tool cliente (callback del navegador) | ✅ `tools.create` (client) | ✅ | ⏳ futuro |
| Probar tool con mocks (`responseMocks`) | ✅ (campo en settings) | ⏳ en curso | ⏳ |
| Signed URLs para el widget | ✅ `getSignedUrl` | — | ✅ `app/api/elevenlabs/session` |
| WebRTC desde el navegador | ✅ SDK React | — | ✅ widget propio |
| Usuario/sesión desde el navegador (`userId`, variables dinámicas) | ✅ `startSession` params | — | ✅ |
| Post-call webhooks (transcripción, audio, coste) | ✅ solicitud vía settings | ⏳ en curso | ✅ endpoint listo |
| Logs/coste de llamadas (`metadata.cost`) | ✅ `conversation.get` | ✅ | ✅ en post-call |
| Outbound call (voz) | ✅ `call.outerTaskOutboundCall` | ✅ | ✅ endpoint backend |
| Telefonía: números Twilio/SIP (Vonage, Telnyx, Plivo, Bandwidth, Exotel) | ✅ import vía dashboard | ✅ | ⏳ según proveedor |
| Asignar agente a un número entrante | ✅ vía dashboard (agent → phone) | ✅ | ⏳ depende de credenciales |
| Transferencia a humano | ✅ system tool «Transfer to number» | ✅ | ⏳ data del cliente |
| WhatsApp inbound (texto y voz) | ✅ import vía Meta WABA | ✅ | ⏳ requiere WABA |
| WhatsApp outbound (templates aprobados) | ✅ | ✅ | ⏳ requiere templates |
| Verificar HMAC de webhooks | ✅ `webhooks.constructEvent` | — | ⏳ |
| Autenticación de agentes (allowlist / signed URLs / web) | ✅ | ✅ | ✅ allowlist+signed URL |

## 2. Qué NO se puede (o es manual)

- **WhatsApp**: requiere Meta Business portfolio + número sin uso previo + método de pago en WhatsApp Manager.
  No puede crearse 100% vía API; implica pasos manuales del cliente. Outbound solo con plantillas aprobadas por Meta.
- **Números de teléfono**: Twilio es proveedor externo (cuenta propia); la conexión (número → agente) se hace en el dashboard.
- **Grabación de llamadas**: se habilita por cliente (workspace/settings), no vía SDK; se entrega vía post-call webhook (audio).
- **Voz en el bot de voz de Telegram**: no soportada por ElevenLabs; usar texto (widget/Tool Layer) o Telefonía/WhatsApp.
- **Enrutamiento CRM avanzado**: es responsabilidad de FactorIA (Tool Layer), no de ElevenLabs.

## 3. SDK oficial (verificado)

| Paquete | Versión en POC | Uso |
|---|---|---|
| `@elevenlabs/elevenlabs-js` | 2.68.0 | Server-side: criar/actualizar agente, tools, signed URLs, outbound, post-call |
| `@elevenlabs/react` | 1.15.2 | Cliente: `ConversationProvider`, `useConversationControls`, `useConversationStatus`, `useConversationMode`, `useConversationInput`; `onMessage` → `MessagePayload { message, role }` |
| Widget passthrough | `@elevenlabs/elevenlabs-widget` (web component `<elevenlabs-convai>`) | Inicio inmediato, reemplazable por widget propio |

> **Corrección sobre la propuesta de Gemini**: `@11labs/react@0.0.8` **no existe**; el paquete oficial es
> `@elevenlabs/react` (v1.x). El widget no debe simularse con `setTimeout`; el POC usa el SDK real.

## 4. Forma de trabajo recomendada

- **Todo lo reproducible por código**: `scripts/setup-agent.ts` (idempotente, `--dry-run` para auditar antes de aplicar).
- **Sensible al cliente / variación**: mantener en el dashboard de ElevenLabs (voz fina, plantillas WhatsApp, teléfonos)
  y documentar en el checklist de onboarding.
- Los secrets de la tool layer se referencian con **selector de secretos** (`secret_key:`) para nunca exponerlos
  en el dashboard a terceros.