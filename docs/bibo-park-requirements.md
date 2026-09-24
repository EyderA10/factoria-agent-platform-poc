# Requisitos — caso de uso Bibo Park

> Bibo Park quiere un agente de voz/chat para consultas de **disponibilidad**, **horarios** y
> **precios** de su parque. Este documento fija los requisitos que el POC debe satisfacer.

## 1. Requisitos funcionales (RF)

| ID | Requisito | Cómo lo cubre el POC |
|---|---|---|
| RF1 | Atender consultas de **disponibilidad** (con/sin fecha) | tool `check_availability` |
| RF2 | Atender **horarios y precios** del parque | misma tool (+ prompt del agente) |
| RF3 | Identificar la **categoría de entrada** (general / premium / vip) | campo `category` del contrato |
| RF4 | Responder en **español**, tono cercano y claro | `language: "es"` + prompt |
| RF5 | Identificar al usuario por su **nombre** | campo `user_name` |
| RF6 | Funcionar **Web** (widget) | widget real sobre `@elevenlabs/react` |
| RF7 | Funcionar por **llamada telefónica** | outbound endpoint + Twilio (recomendado) / SIP; requiere número y billing del cliente |
| RF8 | Funcionar por **WhatsApp** | import WABA con cuenta Meta/Facebook (admin) + número sin uso previo (ver docs/elevenlabs-capabilities.md) |
| RF9 | Entregar un **mensaje inicial** de presentación | `firstMessage` |
| RF10 | **Transferir a humano** si el usuario lo pide | system tool «Transfer to number» (datos del cliente) |
| RF11 | Registrar cada conversación para **mejora y auditoría** | post-call webhook + `metadata.cost` |
| RF12 | **Demo sin credenciales** para evaluar el UX antes de conectar | `NEXT_PUBLIC_FACTORIA_DEMO_MODE` + tarjeta de prueba de la tool |

## 2. Requisitos no funcionales (RNF)

| ID | Requisito |
|---|---|
| RNF1 | Latencia de primera respuesta < 1,5 s (STT/TTS en ElevenLabs) |
| RNF2 | Confirmación de que el agente **no inventa datos**: el prompt obliga a llamar a la tool y el schema valida el payload → nunca responde horarios/precios de memoria |
| RNF3 | Multi-tenant: `tenant_id` para separar clientes (aquí `bibo`) |
| RNF4 | Secretos nunca en el navegador ni en el código |
| RNF5 | Trazabilidad: cada tool call y su resultado quedan en logs/registro |
| RNF6 | Coste por conversación medible (`metadata.cost`) |

## 3. Escape skills del agente (texto base del prompt del POC)

1. Solo responde disponibilidad/horarios/precios con la **tool**; si la tool falla → error honesto salvo en demo.
2. Pide únicamente los datos que falten (categoría/fecha/nombre), nunca datos redundantes.
3. Si el usuario insiste en preguntas fuera de alcance → deriva con naturalidad o sugiere humano.
4. Nunca inventa direcciones, teléfonos o condiciones de Bibo Park; esos datos se entregan solo cuando el cliente
   los proporcione (checklist §3 y §1).

## 4. Datos de Bibo Park necesarios para producción

| Dato | Para qué | Fuente |
|---|---|---|
| Catálogo de productos (entradas, abonos, kits) | Calcular oferta real | Negocio |
| Tabla de precios + horarios de apertura | Responder sin inventar | Negocio |
| Disponibilidad por fecha/capacidad | Validar la consulta RF1 | Sistema / hoja |
| Números/extensiones de transferencia (RF10) | Transferencia a humano | Negocio |
| Política de datos (RF/RNF, aviso de grabación) | Cumplimiento | Legal |

> Con estos datos el agente de producción de Bibo Park se monta repitiendo: tool → contrato → prompt → voz.

## 5. Límites del POC

- Agente real desplegado en ElevenLabs (`agent_8301m385jmsaf4ybzvmvaegk8bsc`) con tool webhook E2E
  validada (agente → FactorIA Tool Layer → datos reales); post-call webhook activo y HMAC verificado.
- WhatsApp y telefonía requieren credenciales externas (Meta WABA / Twilio) que el cliente debe aportar.
- La demo del widget tiene dos modos: **simulado** (sin credenciales, para evaluar UX) y **real**
  (WebRTC con el agente de ElevenLabs vía signed URL).