# FactorIA Agent Platform — POC

Poc de la plataforma de agentes de FactorIA sobre **ElevenLabs Conversational AI** +
**FactorIA Tool Layer** (Next.js). Valida: agente IA por **Web / WhatsApp / Teléfono**,
integración con sistemas del cliente, widget propio y provisioning por código.

> Repo sin `git init` (por decisión del usuario). Paquetes ya instalados con `npm i`.

## Stack

- Next.js 16 + React 19 + Tailwind v4 + Zod
- `@elevenlabs/react` (widget real) + `@elevenlabs/elevenlabs-js` (backend/provisioning)
- scripts con `tsx`

## Estructura

```
factoria-agent-platform-poc/
├─ app/
│  ├─ page.tsx                    # Landing: pasos, prueba de tool, widget
│  ├─ widget/page.tsx             # Vista dedicada del widget
│  ├─ api/
│  │  ├─ tools/check-availability/  # Webhook tool (Bearer + Zod)
│  │  ├─ elevenlabs/session/         # Signed URL server-side
│  │  ├─ telephony/outbound-call/    # Llamada saliente (Twilio) demo
│  │  └─ poc/test-tool/              # Prueba de tool sin exponer secreto
├─ components/
│  ├─ factoria-chat-widget.tsx       # Widget real + modo demo etiquetado
│  └─ tool-test-card.tsx             # Tarjeta de prueba de la tool
├─ lib/
│  ├─ elevenlabs.ts                  # Cliente y sesión
│  └─ tools/check-availability.ts    # Contrato Zod + handler (single source)
├─ scripts/setup-agent.ts            # Provisioning tool+agente (idempotente, --dry-run)
└─ docs/
   ├─ architecture-update.md
   ├─ onboarding-checklist.md
   ├─ elevenlabs-capabilities.md
   ├─ factoria-tool-layer.md
   └─ bibo-park-requirements.md
```

## Configuración

Copia `.env.example` → `.env.local` y completa:

| Variable | Uso | Ejemplo |
|---|---|---|
| `ELEVENLABS_API_KEY` | backend (agentes, signed URLs) | `sk_…` |
| `NEXT_PUBLIC_ELEVENLABS_AGENT_ID` | widget real | `abc123` |
| `FACTORIA_TOOL_SECRET` | Bearer de la tool layer | `dev-secret-change-me` |
| `NEXT_PUBLIC_FACTORIA_BASE_URL` | base de la tool layer para el navegador | `http://localhost:3000` |
| `NEXT_PUBLIC_FACTORIA_DEMO_MODE` | `true` = widget en demo (sin credenciales) | `true` |
| `NEXT_PUBLIC_FACTORIA_AGENT_NAME` | nombre del agente para el widget | `Aura FactorIA` |

## Runbook

1. **Obtén la API key** — https://elevenlabs.io → *Profile → API Keys → Create*. (Cuenta free suficiente para POC.)
2. **Copia el `.env`**: `cp .env.example .env.local` y pega la key.
3. **Audita el provisioning** (no toca nada):
   ```bash
   npx tsx scripts/setup-agent.ts --dry-run
   ```
4. **Provisiona tool + agente** (idempotente: no duplica; `--update-agent` para reaplicar el prompt):
   ```bash
   npx tsx scripts/setup-agent.ts
   ```
   Te imprime el `AGENT_ID`; ponlo en `NEXT_PUBLIC_ELEVENLABS_AGENT_ID` del `.env.local`.
5. **Arranca la app**:
   ```bash
   npm run dev
   ```
   - Abre http://localhost:3000 → prueba la tool (tarjeta) y el widget (demos claramente etiquetadas).
   - Sin API key, la app sigue funcionando en **modo demo** (`NEXT_PUBLIC_FACTORIA_DEMO_MODE=true`).
6. **Prueba la tool por línea**:
   ```bash
   curl -X POST http://localhost:3000/api/tools/check-availability \
     -H "Authorization: Bearer dev-secret-change-me" -H "Content-Type: application/json" \
     -d '{"tenant_id":"bibo","user_name":"Ana","date":"2026-09-23","category":"premium"}'
   ```

## Scripts

| Comando | Qué hace |
|---|---|
| `npm run dev` | servidor de desarrollo |
| `npm run build` | build de producción |
| `npm run typecheck` | tipos (`tsc --noEmit`) |
| `npm run setup` | provisiona tool (secret selector) + agente en ElevenLabs (`--update-tool`, `--update-agent`, `--enable-webhook`) |

## Validado y conocido

- **Estado de validación**: ver `docs/validacion-poc-estado.md` (qué se probó, cómo reproducirlo y qué depende del cliente).
- **Validado E2E**: agente + webhook tool (auth por selector de secretos) y **post-call webhook** con evento real `post_call_transcription` verificado por HMAC.
- **Pendiente de credenciales del cliente**: WhatsApp (Meta WABA), telefonía (Twilio/SIP).
- La **demo del widget** simula al agente localmente; el modo real usa WebRTC vía `@elevenlabs/react` con la signed URL.
- Ver `docs/elevenlabs-capabilities.md` para qué se administra vía API y qué requiere dashboard/terceros.