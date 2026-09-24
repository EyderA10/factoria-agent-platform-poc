/**
 * Provisiona en ElevenLabs todo lo necesario por CLIENTE:
 *   1. Webhook tool (apunta al endpoint de FactorIA con Bearer token resuelto por
 *      secret selector del workspace).
 *   2. Agente que referencia la tool.
 *   3. (opcional) Post-call webhook atado en los settings de ConvAI.
 *
 * La config de cada cliente vive en `scripts/clients/<id>.json` (ver `_template.json`
 * y `_README.md`). Sin `--client` se usa la config por defecto de la POC (Bibo), por lo
 * que el comportamiento histórico `npm run setup` se mantiene igual.
 *
 * Uso:
 *   npm run setup                        # config por defecto (Bibo / "Factoria POC Agent")
 *   npm run setup -- --client bibo       # aprovisiona idempotente usando scripts/clients/bibo.json
 *   npm run setup -- --client bibo --dry-run
 *   npm run setup -- --list-clients
 *   npm run setup -- --update-agent --update-tool --enable-webhook
 *   npm run setup -- --help
 *
 * Idempotente: si la tool/agente ya existen por nombre, los reutiliza (--update-* fuerza update).
 * Priority de valores: CLI flags > env > config del cliente > defaults.
 */
import { ElevenLabsClient, ElevenLabs } from "@elevenlabs/elevenlabs-js";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { z } from "zod";

const cwd = process.cwd();
const CLIENTS_DIR = resolve(cwd, "scripts/clients");

// ---------- tiny .env.local loader (sin dependencias extra) ----------
function loadEnvFile(file: string): Record<string, string> {
  const out: Record<string, string> = {};
  if (!existsSync(file)) return out;
  for (const rawLine of readFileSync(file, "utf8").split("\n")) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq === -1) continue;
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    if (value.startsWith('"') && value.endsWith('"')) value = value.slice(1, -1);
    if (value.startsWith("'") && value.endsWith("'")) value = value.slice(1, -1);
    out[key] = value;
  }
  return out;
}
const localEnv = loadEnvFile(resolve(cwd, ".env.local"));
const dotEnv = loadEnvFile(resolve(cwd, ".env"));
const env: Record<string, string | undefined> = { ...process.env, ...dotEnv, ...localEnv };

// ---------- CLI args ----------
function parseArgs(argv: string[]) {
  const opts: Record<string, string | boolean> = {
    dryRun: false,
    updateAgent: false,
    updateTool: false,
    enableWebhook: false,
    listClients: false,
    help: false,
    toolUrlExplicit: false,
  };
  let pendingKey: string | null = null;
  for (const arg of argv) {
    if (arg.startsWith("--")) {
      pendingKey = null;
      const eq = arg.indexOf("=");
      const key = eq === -1 ? arg.slice(2) : arg.slice(2, eq);
      const value = eq === -1 ? "" : arg.slice(eq + 1);
      switch (key) {
        case "dry-run": opts.dryRun = true; break;
        case "update-agent": opts.updateAgent = true; break;
        case "update-tool": opts.updateTool = true; break;
        case "enable-webhook": opts.enableWebhook = true; break;
        case "list-clients": opts.listClients = true; break;
        case "help": opts.help = true; break;
        case "agent-name": value ? (opts.agentName = value) : (pendingKey = "agentName"); break;
        case "client": value ? (opts.client = value) : (pendingKey = "client"); break;
        case "tool-url":
          if (value) { opts.toolUrl = value; opts.toolUrlExplicit = true; } else pendingKey = "toolUrl";
          break;
        case "webhook-url": value ? (opts.webhookUrl = value) : (pendingKey = "webhookUrl"); break;
        case "secret": value ? (opts.secret = value) : (pendingKey = "secret"); break;
        case "secret-name": value ? (opts.secretName = value) : (pendingKey = "secretName"); break;
        default: break;
      }
    } else if (pendingKey) {
      opts[pendingKey] = arg;
      pendingKey = null;
    }
  }
  return opts;
}

// ---------- Config por cliente (scripts/clients/<id>.json) ----------
const schemaProp = z.object({
  type: z.union([
    z.literal("boolean"),
    z.literal("string"),
    z.literal("integer"),
    z.literal("number"),
    z.array(z.string()),
  ]),
  description: z.string().optional(),
  enum: z.array(z.string()).optional(),
});
const ClientFileSchema = z.object({
  id: z.string().min(1),
  agentName: z.string().optional(),
  baseUrl: z.string().optional(),
  language: z.string().optional(),
  timezone: z.string().optional(),
  firstMessage: z.string().optional(),
  systemPrompt: z.string().optional(),
  ttsModel: z.string().optional(),
  enableWebhook: z.boolean().optional(),
  secret: z.object({ name: z.string().optional(), value: z.string().optional() }).optional(),
  tool: z
    .object({
      name: z.string().optional(),
      url: z.string().optional(),
      description: z.string().optional(),
      requestBodySchema: z
        .object({ properties: z.record(z.string(), schemaProp).optional(), required: z.array(z.string()).optional() })
        .optional(),
    })
    .optional(),
});
type ClientFile = {
  id: string;
  agentName?: string;
  baseUrl?: string;
  language?: string;
  timezone?: string;
  firstMessage?: string;
  systemPrompt?: string;
  ttsModel?: string;
  enableWebhook?: boolean;
  secret?: { name?: string; value?: string };
  tool?: {
    name?: string;
    url?: string;
    description?: string;
    requestBodySchema?: { properties?: Record<string, SchemaProp>; required?: string[] };
  };
};
type SchemaProp = {
  type: "boolean" | "string" | "integer" | "number" | string[];
  description?: string;
  enum?: string[];
};

function clientFile(id: string): string {
  return join(CLIENTS_DIR, `${id}.json`);
}

function loadClientConfig(id: string): ClientFile {
  const file = clientFile(id);
  if (!existsSync(file)) {
    const available = listClientIds().join(", ") || "(ninguno)";
    throw new Error(`No existe el cliente "${id}" en scripts/clients/. Disponibles: ${available}`);
  }
  return ClientFileSchema.parse(JSON.parse(readFileSync(file, "utf8"))) as unknown as ClientFile;
}

function listClientIds(): string[] {
  if (!existsSync(CLIENTS_DIR)) return [];
  return readdirSync(CLIENTS_DIR)
    .filter((f) => f.endsWith(".json") && !f.startsWith("_"))
    .map((f) => f.replace(/\.json$/, ""))
    .sort();
}

// ---------- Defaults (equivalen a la config original del POC) ----------
const DEFAULT_FIRST_MESSAGE =
  "¡Hola! Soy el agente de FactorIA. ¿En qué puedo ayudarte? Puedo consultarte disponibilidad y precios.";
const DEFAULT_SYSTEM_PROMPT = `Eres el agente omnicanal de FactorIA para el cliente "{{agentName}}".

Normas de uso de la tool check_availability:
1. Cuando el usuario pregunte por disponibilidad, precio u horarios de entradas/tickets, llama SIEMPRE a la tool check_availability.
2. Extrae category (general | premium | vip), date y user_name de la conversación; usa el tenant por defecto si no se conoce.
3. Nunca preguntes datos que puedas inferir de la conversación.
4. Responde con los horarios y precios reales que devuelva la tool, de forma natural y breve.

Reglas de comportamiento conversacional:
5. Saluda UNA SOLA VEZ al inicio de la conversación (mensaje de bienvenida ya definido). No vuelvas a saludarte, presentarte ni repetir tu nombre en turnos posteriores.
6. Tras cumplir una petición del usuario puedes cerrar como MÁXIMO UNA VEZ (en ese mismo turno) con una frase breve tipo "¿Hay algo más en lo que pueda ayudarte?". Nunca repitas esa pregunta, nunca preguntes "¿sigues ahí?", "¿me escuchas?" ni rellenes silencios.
7. Responde únicamente cuando el usuario se comunique, de forma breve y natural.
8. Despídete de forma breve solo si el usuario se despide o pide terminar.`;

const DEFAULT_TOOL_DESCRIPTION =
  "Consulta disponibilidad y precio de entradas del tenant. Úsala cuando el usuario pregunte por disponibilidad, precios u horarios.";

const apiKey = env.ELEVENLABS_API_KEY ?? "";

const DEFAULT_BODY_SCHEMA: BodySchema = {
  type: "object",
  properties: {
    tenant_id: { type: "string", description: "Identificador del cliente/tenant FactorIA" },
    user_name: { type: "string", description: "Nombre del usuario final" },
    date: { type: "string", description: "Fecha de la consulta (p.ej. hoy o YYYY-MM-DD)" },
    category: { type: "string", description: "Categoría de entrada consultada", enum: ["general", "premium", "vip"] },
  },
  required: ["category", "date"],
};

type BodySchema = {
  type: "object";
  properties: Record<string, SchemaProp>;
  required?: string[];
};

type ResolvedConfig = {
  clientId: string;
  agentName: string;
  baseUrl: string;
  toolUrl: string;
  webhookUrl: string;
  enableWebhook: boolean;
  secretName: string;
  toolSecret: string;
  language: string;
  timezone: string;
  firstMessage: string;
  systemPrompt: string;
  ttsModel: string;
  tool: {
    name: string;
    url: string;
    description: string;
    requestBodySchema: BodySchema;
  };
};

function str(v: string | boolean | undefined): string {
  return v === undefined ? "" : String(v).trim();
}

function resolveConfig(args: Record<string, string | boolean>, file?: ClientFile): ResolvedConfig {
  const agentName = str(args.agentName) || file?.agentName || "Factoria POC Agent";
  const baseUrl = (
    str(args.toolUrl) || str(env.NEXT_PUBLIC_FACTORIA_BASE_URL) || file?.baseUrl || "http://localhost:3000"
  ).replace(/\/$/, "");
  const toolUrl = args.toolUrlExplicit
    ? `${baseUrl}/api/tools/check-availability`
    : file?.tool?.url || `${baseUrl}/api/tools/check-availability`;
  const webhookUrl = (str(args.webhookUrl) || `${baseUrl}/api/webhooks/elevenlabs`).replace(/\/$/, "");
  const secretName = str(args.secretName) || file?.secret?.name || "FACTORIA_TOOL_SECRET";
  const toolSecret = str(args.secret) || env.FACTORIA_TOOL_SECRET || file?.secret?.value || "factoria-secret-token-2026";
  const requestBodySchema: BodySchema = file?.tool?.requestBodySchema
    ? { type: "object", properties: file.tool.requestBodySchema.properties ?? {}, required: file.tool.requestBodySchema.required }
    : DEFAULT_BODY_SCHEMA;

  return {
    clientId: file?.id || "default",
    agentName,
    baseUrl,
    toolUrl,
    webhookUrl,
    enableWebhook: Boolean(args.enableWebhook) || Boolean(file?.enableWebhook),
    secretName,
    toolSecret,
    language: file?.language || "es",
    timezone: file?.timezone || "America/Bogota",
    firstMessage: file?.firstMessage || DEFAULT_FIRST_MESSAGE,
    systemPrompt: (file?.systemPrompt || DEFAULT_SYSTEM_PROMPT).split("{{agentName}}").join(agentName),
    ttsModel: file?.ttsModel || "eleven_flash_v2_5",
    tool: {
      name: file?.tool?.name || "check_availability",
      url: toolUrl,
      description: file?.tool?.description || DEFAULT_TOOL_DESCRIPTION,
      requestBodySchema,
    },
  };
}

/**
 * El header Authorization usa un selector de secreto (`secret_id`) del secret store
 * del workspace, de forma que el literal nunca queda expuesto en la config de la tool.
 * En dry-run/dev sin secret se cae al literal para compatibilidad local.
 */
function toolApiSchema(cfg: ResolvedConfig, secretId?: string) {
  return {
    url: cfg.tool.url,
    method: "POST" as const,
    contentType: "application/json" as const,
    requestHeaders: secretId
      ? { Authorization: { secretId } }
      : { Authorization: `Bearer ${cfg.toolSecret}` },
    requestBodySchema: cfg.tool.requestBodySchema,
    responseTimeoutSecs: 30,
    interruptionMode: "disable_during_tool_and_turn",
  };
}

/** Patch REST (snake_case) de la api_schema del webhook tool. */
function toolApiSchemaRawPatch(cfg: ResolvedConfig, secretId: string) {
  return {
    tool_config: {
      type: "webhook",
      name: cfg.tool.name,
      description: cfg.tool.description,
      api_schema: {
        url: cfg.tool.url,
        method: "POST",
        content_type: "application/json",
        request_headers: { Authorization: { secret_id: secretId } },
        request_body_schema: cfg.tool.requestBodySchema,
        response_timeout_secs: 30,
        interruption_mode: "disable_during_tool_and_turn",
      },
    },
  };
}

/** Crea o reutiliza un secret en el workspace de ElevenLabs y devuelve su id. */
async function ensureToolSecret(client: ElevenLabsClient, name: string, value: string): Promise<string> {
  const list = await client.conversationalAi.secrets.list();
  const existing = list.secrets.find((s) => s.name === name);
  if (existing) return existing.secretId;
  const created = await client.conversationalAi.secrets.create({ name, value });
  return created.secretId;
}

/**
 * Workspace webhook de post-call (HMAC): lo crea si no existe y lo ata como
 * receptor `post_call` en los settings de ConvAI (evento "transcript").
 * El signing secret que devuelve la plataforma (solo en la creación) debe
 * guardarse como ELEVENLABS_WEBHOOK_SECRET para que el endpoint lo verifique.
 */
async function ensurePostCallWebhook(client: ElevenLabsClient, url: string) {
  const listed = await client.webhooks.list({ includeUsages: false });
  let webhookId = listed.webhooks.find((w) => w.webhookUrl === url)?.webhookId;

  if (!webhookId) {
    const created = await client.webhooks.create({
      settings: {
        authType: "hmac",
        name: "FactorIA post-call",
        webhookUrl: url,
      },
    });
    webhookId = created.webhookId;
    if (created.webhookSecret) {
      log("WEBHOOK", [`Nuevo signing secret (pégalo en ELEVENLABS_WEBHOOK_SECRET): ${created.webhookSecret}`]);
    }
  }

  const current = await client.conversationalAi.settings.get();
  const bound = current.webhooks?.postCallWebhookId === webhookId;
  await client.conversationalAi.settings.update({
    webhooks: {
      postCallWebhookId: webhookId,
      events: ["transcript"],
      transcriptFormat: "json",
    },
  });

  log("WEBHOOK", [
    `Post-call webhook → ${webhookId} (${url})`,
    `Atado en settings ConvAI (evento transcript, formato json)${bound ? " — ya estaba atado" : ""}`,
    "HMAC verificado en app/api/webhooks/elevenlabs con ELEVENLABS_WEBHOOK_SECRET.",
  ]);
}

function log(title: string, lines: string[]) {
  const width = Math.max(title.length, ...lines.map((l) => l.length)) + 4;
  console.log(`\n${"─".repeat(width)}\n  ${title}\n${"─".repeat(width)}`);
  for (const l of lines) console.log(`  ${l}`);
  console.log();
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  if (args.help) {
    console.log(`
Provisiona ElevenLabs por cliente (agente + webhook tool + post-call opcional).
La config por cliente vive en scripts/clients/<id>.json (ver _template.json).

--client ID         Aprovisiona con la config de scripts/clients/<id>.json.
--list-clients      Lista los clientes configurados.
--dry-run           Muestra qué haría sin llamar a la API.
--agent-name NAME   Override del nombre del agente.
--tool-url URL      Override de la base URL del endpoint FactorIA.
--secret SECRET     Override del valor del secret (FACTORIA_TOOL_SECRET).
--secret-name NAME  Override del nombre del secret en el workspace.
--update-agent      Si el agente ya existe, forzar update (re-aplica prompt + tools).
--update-tool       Si la tool ya existe, forzar update de su api_schema (auth secret selector).
--enable-webhook    Crea (o reutiliza) el post-call webhook y lo ata en settings ConvAI.
--webhook-url URL   Override de la URL del post-call webhook.
--help              Esta ayuda.
`);
    return;
  }

  if (args.listClients) {
    const ids = listClientIds();
    console.log(`Clientes configurados (${ids.length}):`);
    for (const id of ids) console.log(`  - ${id}`);
    return;
  }

  const file = str(args.client) ? loadClientConfig(str(args.client)) : undefined;
  const cfg = resolveConfig(args, file);

  const secretLabel = cfg.toolSecret === "factoria-secret-token-2026" ? " (default de desarrollo)" : "";
  console.log(`\nfactorIA POC · ElevenLabs provisioning\n`);
  console.log(`  cliente: ${cfg.clientId}`);
  console.log(`  agent  : ${cfg.agentName}`);
  console.log(`  tool   : ${cfg.tool.name} → ${cfg.tool.url}`);
  console.log(`  auth   : Authorization vía secret selector (secret_id:${cfg.secretName})${secretLabel}`);
  console.log(`  webhook: ${cfg.enableWebhook ? cfg.webhookUrl : "deshabilitado (usa --enable-webhook o enableWebhook en config)"}`);
  console.log(`  dry-run: ${args.dryRun ? "SÍ (no se ejecuta nada)" : "no"}\n`);

  if (!apiKey) {
    if (args.dryRun) {
      log("ATENCIÓN", ["ELEVENLABS_API_KEY no definida. En dry-run seguimos con valores ficticios."]);
    } else {
      log("ERROR", [
        "ELEVENLABS_API_KEY no está definida.",
        "1. Cópiala en .env.local (ver .env.example).",
        "2. O ejecuta primero: npm run setup -- --dry-run",
      ]);
      process.exit(1);
    }
  }

  const client = apiKey ? new ElevenLabsClient({ apiKey }) : null;

  // Crea o reutiliza el secret del workspace y referencia la tool por secret_id,
  // para que el Bearer nunca quede literal en la config de la tool.
  // El valor del secret es el header COMPLETO (`Bearer <token>`), que ElevenLabs
  // resolverá al enviar la llamada al webhook tool.
  const toolSecretId = client ? await ensureToolSecret(client, cfg.secretName, `Bearer ${cfg.toolSecret}`) : undefined;

  if (args.dryRun || !client) {
    log("DRY-RUN: tool", [
      `POST ${cfg.tool.url}`,
      `headers: { Authorization: { secret_id: "${cfg.secretName}" } } (selector de secreto)`,
      `body: { ${Object.keys(cfg.tool.requestBodySchema.properties).join(", ")} }`,
    ]);
    const draft = buildRestConfig(cfg, cfg.tool.name);
    console.log("JSON de conversation_config (snake_case, vía REST) que se enviaría:\n", JSON.stringify(draft, null, 2));
    return;
  }

  // ---- 0. Post-call webhook (opcional) ----
  if (cfg.enableWebhook && client) {
    await ensurePostCallWebhook(client, cfg.webhookUrl);
  }

  // ---- 1. Tool ----
  let toolId: string;
  const existingTool = (await findAllTools(client)).find((t) => t.name === cfg.tool.name);
  if (existingTool && args.updateTool) {
    toolId = existingTool.id;
    if (!toolSecretId) {
      log("ERROR", ["No se pudo obtener el secret del workspace para el header de la tool."]);
      process.exit(1);
    }
    await elevenlabsRest("PATCH", `/v1/convai/tools/${toolId}`, toolApiSchemaRawPatch(cfg, toolSecretId));
    log("TOOL", [
      `Actualizada "${cfg.tool.name}" → id ${toolId}`,
      `URL: ${cfg.tool.url}`,
      `Auth: Authorization: { secret_id: ${cfg.secretName} } (sin literal)`,
    ]);
  } else if (existingTool) {
    toolId = existingTool.id;
    log("TOOL", [
      "Ya existe: " + cfg.tool.name + " → id " + toolId,
      "Se reutiliza (no se modifica). Usa --update-tool para migrar su auth al secret selector.",
    ]);
  } else {
    const created = await client.conversationalAi.tools.create({
      toolConfig: {
        type: "webhook",
        name: cfg.tool.name,
        description: cfg.tool.description,
        apiSchema: toolApiSchema(cfg, toolSecretId),
      },
    });
    toolId = created.id;
    log("TOOL", [
      "Creada " + cfg.tool.name + " → id " + toolId,
      `URL: ${cfg.tool.url}`,
      `Auth: Authorization: { secret_id: ${cfg.secretName} } (sin literal)`,
    ]);
  }

  // ---- 2. Agent ----

  const existingAgent = (await findAllAgents(client)).find((a) => a.name === cfg.agentName);

  if (existingAgent && !args.updateAgent) {
    log("AGENTE", [
      `Ya existe "${cfg.agentName}" → id ${existingAgent.id}`,
      "Reutilizado. Usa --update-agent para re-aplicar prompt/tools.",
      "Copia el ID en .env.local como NEXT_PUBLIC_ELEVENLABS_AGENT_ID.",
    ]);
    finish(cfg, existingAgent.id, toolId);
    return;
  }

  if (existingAgent && args.updateAgent) {
    await updateAgentViaRest(existingAgent.id, buildRestConfig(cfg, toolId));
    log("AGENTE", [`Actualizado "${cfg.agentName}" → id ${existingAgent.id} (prompt + tool_ids re-aplicados).`]);
    finish(cfg, existingAgent.id, toolId);
    return;
  }

  const createdAgent = await createAgentViaRest(cfg.agentName, buildRestConfig(cfg, toolId));
  log("AGENTE", ["Creado " + cfg.agentName + " → id " + createdAgent.agentId]);
  finish(cfg, createdAgent.agentId, toolId);
}

// ---------------------------------------------------------------------------
// El enum `Llm` del SDK (v2.68.0) NO incluye eleven_turbo_v2_5 / eleven_flash_v2_5,
// por lo que agents.create/update fallan en validación de runtime aunque la API
// los acepta (requisito para agentes no-ingleses). Se usa fetch crudo al mismo
// endpoint REST; el resto del script sigue usando el SDK.
// ---------------------------------------------------------------------------
const REST_BASE = "https://api.elevenlabs.io";

function buildRestConfig(cfg: ResolvedConfig, toolId: string) {
  return {
    text_only: false,
    conversation: {
      client_events: [
        "user_transcript",
        "tentative_user_transcript",
        "agent_response",
        "agent_response_complete",
        "agent_chat_response_part",
      ],
    },
    // Pausas cortas del usuario no rebotan el turno ni reinician el saludo.
    // El widget resetea este timer con el evento user_activity mientras hay
    // inactividad, así el agente nunca retoma por silencio (30s = máximo).
    turn: {
      turn_timeout: 30,
    },
    agent: {
      first_message: cfg.firstMessage,
      language: cfg.language,
      prompt: {
        prompt: cfg.systemPrompt,
        llm: "gemini-2.5-flash",
        timezone: cfg.timezone,
        tool_ids: [toolId],
      },
    },
    // OBLIGATORIO para agentes no-ingleses: el TTS por defecto (eleven_flash_v2) es
    // solo inglés; con language distinto el servidor exige un modelo v2.5.
    tts: {
      model_id: cfg.ttsModel,
    },
  };
}

async function elevenlabsRest(method: string, path: string, body: unknown) {
  const res = await fetch(`${REST_BASE}${path}`, {
    method,
    headers: {
      "xi-api-key": apiKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  if (!res.ok) {
    const detail = (() => {
      try {
        return JSON.parse(text);
      } catch {
        return text;
      }
    })();
    throw new Error(`ElevenLabs REST ${method} ${path} → ${res.status}: ${JSON.stringify(detail)}`);
  }
  return JSON.parse(text || "{}");
}

async function createAgentViaRest(name: string, conversationConfig: unknown) {
  const data = await elevenlabsRest("POST", "/v1/convai/agents/create", {
    name,
    conversation_config: conversationConfig,
  });
  return { agentId: data.agent_id };
}

async function updateAgentViaRest(agentId: string, conversationConfig: unknown) {
  await elevenlabsRest("PATCH", `/v1/convai/agents/${agentId}`, {
    conversation_config: conversationConfig,
  });
}

function finish(cfg: ResolvedConfig, agentId: string, toolId: string) {
  const sample: Record<string, unknown> = {};
  for (const [key, prop] of Object.entries(cfg.tool.requestBodySchema.properties)) {
    sample[key] = prop.enum?.[0] ?? "…";
  }
  console.log("─────────────────────────────────────────────────────────────");
  console.log("\n  Siguientes pasos:\n");
  console.log(`  1. En .env.local pon:`);
  console.log(`       NEXT_PUBLIC_ELEVENLABS_AGENT_ID=${agentId}`);
  console.log(`       ELEVENLABS_API_KEY=<tu api key>`);
  console.log(`  2. npm run dev`);
  console.log(`  3. Abre http://localhost:3000 y usa el widget (voz) o la tarjeta de prueba.`);
  console.log(`\n  Tool webhook creada/vinculada: ${cfg.tool.name} (${toolId})`);
  console.log(
    `  -> En la consola de ElevenLabs (Agents → Tools) puedes verla; también aparece dentro del agente "${cfg.agentName}".`
  );
  console.log(
    `  -> Para probar el webhook directamente:\n     curl -X POST ${cfg.tool.url} -H "Authorization: Bearer $FACTORIA_TOOL_SECRET" -H "Content-Type: application/json" -d '${JSON.stringify(sample)}'`
  );
  console.log("");
}

async function findAllTools(client: ElevenLabsClient) {
  const out: { id: string; name: string }[] = [];
  let cursor: string | undefined;
  do {
    const res = await client.conversationalAi.tools.list({
      pageSize: 100,
      cursor: cursor,
      types: "webhook",
    });
    for (const t of res.tools) {
      const toolName = (t.toolConfig as { name?: string }).name ?? "";
      out.push({ id: t.id, name: toolName });
    }
    cursor = res.nextCursor;
    if (!res.hasMore) break;
  } while (cursor);
  return out;
}

async function findAllAgents(client: ElevenLabsClient) {
  const out: { id: string; name: string }[] = [];
  let cursor: string | undefined;
  do {
    const res = await client.conversationalAi.agents.list({
      pageSize: 100,
      cursor: cursor,
    });
    for (const a of res.agents) out.push({ id: a.agentId, name: a.name });
    cursor = res.nextCursor;
    if (!res.hasMore) break;
  } while (cursor);
  return out;
}

main().catch((err) => {
  console.error("\n[setup] error:", err);
  process.exit(1);
});