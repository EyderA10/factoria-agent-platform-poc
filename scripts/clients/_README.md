# Configuraciones por cliente — `setup-agent`

Cada archivo `<id>.json` define un cliente. Provision (o reutiliza) en el workspace de
ElevenLabs el secret, la tool webhook, el agente y el post-call webhook de ese cliente:

```bash
npm run setup -- --client <id>            # aprovisiona (idempotente)
npm run setup -- --client <id> --dry-run  # audita sin ejecutar
npm run setup -- --list-clients           # lista clientes disponibles
```

## Campos

| Campo | Obligatorio | Descripción |
|---|---|---|
| `id` | sí | Identificador del cliente; con él se nombra el archivo y es el `tenant_id` por defecto |
| `agentName` | no | Nombre del agente en ElevenLabs (si ya existe por nombre se reutiliza) |
| `baseUrl` | sí | Base URL del deploy de FactorIA para este cliente |
| `language`, `timezone`, `ttsModel` | no | Idioma, zona horaria y modelo TTS (defaults: `es`, `America/Bogota`, `eleven_flash_v2_5`) |
| `firstMessage` | no | Mensaje de bienvenida del agente |
| `systemPrompt` | no | Prompt del agente. Usa `{{agentName}}` para interpolar el nombre |
| `enableWebhook` | no | Activa el post-call webhook de este cliente (equivale a `--enable-webhook`) |
| `secret.name` / `secret.value` | no | Nombre del secret en el workspace (se crea si no existe) y valor (`Bearer <token>`). Si se omite, usa `FACTORIA_TOOL_SECRET` del entorno |
| `tool.name` | no | Nombre de la tool webhook (si es distinto, se crea una tool propia para el cliente) |
| `tool.url` | no | Endpoint del FactorIA Tool Layer al que apunta la tool |
| `tool.description` | no | Descripción de la tool que ve el LLM |
| `tool.requestBodySchema` | no | JSON Schema del body que el agente envía a la tool |

## Flags de override (CLI > env > config)

`--agent-name`, `--tool-url`, `--secret`, `--secret-name`, `--webhook-url`,
`--enable-webhook`, `--update-tool`, `--update-agent`, `--dry-run`, `--help`.

## Nota

`<id>.json` es la única pieza por cliente que FactorIA edita para montar otro agente
(su negocio, su endpoint, sus secretos). Nada del código cambia.