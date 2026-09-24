/**
 * Provisiona en ElevenLabs todo lo necesario para la POC:
 *   1. Webhook tool `check_availability` (apunta al endpoint de FactorIA con Bearer token).
 *   2. Agente `Factoria POC Agent` que referencia la tool.
 *
 * Uso:
 *   npm run setup            # crea o reutiliza tool + agente
 *   npm run setup -- --dry-run --agent-name "Mi Agente" --tool-url https://casa.vercel.app
 *   npm run setup -- --update-agent
 *   npm run setup -- --help
 *
 * Idempotente: si la tool/agente ya existen por nombre, los reutiliza (--update-agent fuerza update).
 * El secreto Bearer se lee de FACTORIA_TOOL_SECRET (.env / .env.local), igual que el endpoint.
 */
import { ElevenLabsClient, ElevenLabs } from "@elevenlabs/elevenlabs-js";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const cwd = process.cwd();

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
    toolUrlExplicit: false,
  };
  const positional: string[] = [];
  for (const arg of argv) {
    if (arg === "--dry-run") opts.dryRun = true;
    else if (arg === "--update-agent") opts.updateAgent = true;
    else if (arg === "--update-tool") opts.updateTool = true;
    else if (arg === "--enable-webhook") opts.enableWebhook = true;
    else if (arg.startsWith("--webhook-url=")) opts.webhookUrl = arg.split("=")[1];
    else if (arg === "--help") opts.help = true;
    else if (arg === "--agent-name") opts.agentName = "";
    else if (opts.agentName === "") opts.agentName = arg;
    else if (arg.startsWith("--agent-name=")) opts.agentName = arg.split("=")[1];
    else if (arg.startsWith("--tool-url=")) {
      opts.toolUrl = arg.split("=")[1];
      opts.toolUrlExplicit = true;
    } else if (arg.startsWith("--secret=")) opts.secret = arg.split("=")[1];
    else if (arg.startsWith("--secret-name=")) opts.secretName = arg.split("=")[1];
    else positional.push(arg);
  }
  return opts;
}

const args = parseArgs(process.argv.slice(2));
const dryRun = Boolean(args.dryRun);
const updateAgent = Boolean(args.updateAgent);
const updateTool = Boolean(args.updateTool);
const enableWebhook = Boolean(args.enableWebhook);
const agentName = String(args.agentName ?? "Factoria POC Agent");
const toolUrl = String(args.toolUrl ?? env.NEXT_PUBLIC_FACTORIA_BASE_URL ?? "http://localhost:3000").replace(/\/$/, "");
const toolUrlExplicit = Boolean(args.toolUrlExplicit);
const webhookUrl = String(args.webhookUrl ?? `${toolUrl}/api/webhooks/elevenlabs`).replace(/\/$/, "");
const toolSecret = String(args.secret ?? env.FACTORIA_TOOL_SECRET ?? "factoria-secret-token-2026");
const secretName = String(args.secretName ?? "FACTORIA_TOOL_SECRET");
const apiKey = env.ELEVENLABS_API_KEY ?? "";

const TOOL_NAME = "check_availability";
const TOOL_ID = "factoria_check_availability";

const SYSTEM_PROMPT = `Eres el agente omnicanal de FactorIA para el cliente "${agentName}".

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

/**
 * El header Authorization usa un selector de secreto (`secret_id`) del secret store
 * del workspace, de forma que el literal nunca queda expuesto en la config de la tool.
 * En dry-run/dev sin secret se cae al literal para compatibilidad local.
 */
function toolApiSchema(toolEndpoint: string, secretId?: string) {
  return {
    url: `${toolEndpoint}/api/tools/check-availability`,
    method: "POST" as const,
    contentType: "application/json" as const,
    requestHeaders: secretId
      ? { Authorization: { secretId } }
      : { Authorization: `Bearer ${toolSecret}` },
    requestBodySchema: {
      type: "object" as const,
      properties: {
        tenant_id: { type: "string" as const, description: "Identificador del cliente/tenant FactorIA" },
        user_name: { type: "string" as const, description: "Nombre del usuario final" },
        date: { type: "string" as const, description: "Fecha de la consulta (p.ej. hoy o YYYY-MM-DD)" },
        category: {
          type: "string" as const,
          description: "Categoría de entrada consultada",
          enum: ["general", "premium", "vip"],
        },
      },
      required: ["category", "date"],
    },
    responseTimeoutSecs: 30,
    interruptionMode: "disable_during_tool_and_turn",
  };
}

/** JSON-schema del body (compartido entre SDK camelCase y REST snake_case). */
function toolBodyJsonSchema() {
  return {
    type: "object",
    properties: {
      tenant_id: { type: "string", description: "Identificador del cliente/tenant FactorIA" },
      user_name: { type: "string", description: "Nombre del usuario final" },
      date: { type: "string", description: "Fecha de la consulta (p.ej. hoy o YYYY-MM-DD)" },
      category: { type: "string", description: "Categoría de entrada consultada", enum: ["general", "premium", "vip"] },
    },
    required: ["category", "date"],
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

/** Devuelve la URL actual del webhook tool (para --update-tool sin --tool-url). */
async function currentToolUrl(client: ElevenLabsClient, toolId: string): Promise<string> {
  const data = await client.conversationalAi.tools.get(toolId);
  const url = (data.toolConfig as { apiSchema?: { url?: string } }).apiSchema?.url;
  if (!url) throw new Error(`No se pudo leer la URL de la tool ${toolId}`);
  return url;
}

/** Patch REST (snake_case) de la api_schema del webhook tool. */
function toolApiSchemaRawPatch(toolEndpoint: string, secretId: string) {
  return {
    tool_config: {
      type: "webhook",
      name: TOOL_NAME,
      description:
        "Consulta disponibilidad y precio de entradas del tenant. Úsala cuando el usuario pregunte por disponibilidad, precios u horarios.",
      api_schema: {
        url: `${toolEndpoint}/api/tools/check-availability`,
        method: "POST",
        content_type: "application/json",
        request_headers: { Authorization: { secret_id: secretId } },
        request_body_schema: toolBodyJsonSchema(),
        response_timeout_secs: 30,
        interruption_mode: "disable_during_tool_and_turn",
      },
    },
  };
}

function log(title: string, lines: string[]) {
  const width = Math.max(title.length, ...lines.map((l) => l.length)) + 4;
  console.log(`\n${"─".repeat(width)}\n  ${title}\n${"─".repeat(width)}`);
  for (const l of lines) console.log(`  ${l}`);
  console.log();
}

async function main() {
  if (args.help) {
    console.log(`
Provisiona la POC en ElevenLabs (agente + webhook tool).

--dry-run            Muestra qué haría sin llamar a la API.
--agent-name NAME    Nombre del agente (default: "Factoria POC Agent").
--tool-url URL       Base URL del endpoint FactorIA (default: NEXT_PUBLIC_FACTORIA_BASE_URL).
--secret SECRET      Override de FACTORIA_TOOL_SECRET.
--secret-name NAME   Nombre del secret en el workspace de ElevenLabs (default: FACTORIA_TOOL_SECRET).
--update-agent       Si el agente ya existe, forzar update (re-aplica prompt + tools).
--update-tool        Si la tool ya existe, forzar update de su api_schema (auth con secret selector).
--enable-webhook     Crea (o reutiliza) el webhook de post-call y lo ata en los settings de ConvAI.
--webhook-url URL    URL base del post-call webhook (default: <--tool-url>/api/webhooks/elevenlabs).
--help               Esta ayuda.
`);
    return;
  }

  const toolVisibleUrl = `${toolUrl}/api/tools/check-availability`;
  const secretLabel = toolSecret === "factoria-secret-token-2026" ? " (default de desarrollo)" : "";
  console.log(`\nfactorIA POC · ElevenLabs provisioning\n`);
  console.log(`  agent  : ${agentName}`);
  console.log(`  tool   : ${TOOL_NAME} → ${toolVisibleUrl}`);
  console.log(`  auth   : Authorization vía secret selector (secret_id:${secretName})${secretLabel}`);
  console.log(`  webhook: ${enableWebhook ? webhookUrl : "deshabilitado (usa --enable-webhook)"}`);
  console.log(`  dry-run: ${dryRun ? "SÍ (no se ejecuta nada)" : "no"}\n`);

  if (!apiKey) {
    if (dryRun) {
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
  const toolSecretId = client ? await ensureToolSecret(client, secretName, `Bearer ${toolSecret}`) : undefined;

  if (dryRun || !client) {
    log("DRY-RUN: tool", [
      `POST ${toolVisibleUrl}`,
      `headers: { Authorization: { secret_id: "${secretName}" } } (selector de secreto)`,
      `body: { tenant_id?, user_name?, date, category }`,
    ]);
    const draft = buildRestConfig(TOOL_ID);
    console.log("JSON de conversation_config (snake_case, vía REST) que se enviaría:\n", JSON.stringify(draft, null, 2));
    return;
  }

  // ---- 0. Post-call webhook (opcional) ----
  if (enableWebhook && client) {
    await ensurePostCallWebhook(client, webhookUrl);
  }

  // ---- 1. Tool ----
  let toolId: string;
  const existingTool = (await findAllTools(client)).find((t) => t.name === TOOL_NAME);
  if (existingTool && updateTool) {
    toolId = existingTool.id;
    const endpoint = toolUrlExplicit ? toolUrl : await currentToolUrl(client, toolId);
    if (!toolSecretId) {
      log("ERROR", ["No se pudo obtener el secret del workspace para el header de la tool."]);
      process.exit(1);
    }
    await elevenlabsRest("PATCH", `/v1/convai/tools/${toolId}`, toolApiSchemaRawPatch(endpoint, toolSecretId));
    log("TOOL", [
      `Actualizada "${TOOL_NAME}" → id ${toolId}`,
      `URL: ${endpoint}/api/tools/check-availability`,
      `Auth: Authorization: { secret_id: ${secretName} } (sin literal)`,
    ]);
  } else if (existingTool) {
    toolId = existingTool.id;
    log("TOOL", [
      "Ya existe: " + TOOL_NAME + " → id " + toolId,
      "Se reutiliza (no se modifica). Usa --update-tool para migrar su auth al secret selector.",
    ]);
  } else {
    const created = await client.conversationalAi.tools.create({
      toolConfig: {
        type: "webhook",
        name: TOOL_NAME,
        description:
          "Consulta disponibilidad y precio de entradas del tenant. Úsala cuando el usuario pregunte por disponibilidad, precios u horarios.",
        apiSchema: toolApiSchema(toolUrl, toolSecretId),
      },
    });
    toolId = created.id;
    log("TOOL", [
      "Creada " + TOOL_NAME + " → id " + toolId,
      `URL: ${toolVisibleUrl}`,
      `Auth: Authorization: { secret_id: ${secretName} } (sin literal)`,
    ]);
  }

  // ---- 2. Agent ----

  const existingAgent = (await findAllAgents(client)).find((a) => a.name === agentName);

  if (existingAgent && !updateAgent) {
    log("AGENTE", [
      `Ya existe "${agentName}" → id ${existingAgent.id}`,
      "Reutilizado. Usa --update-agent para re-aplicar prompt/tools.",
      "Copia el ID en .env.local como NEXT_PUBLIC_ELEVENLABS_AGENT_ID.",
    ]);
    finish(existingAgent.id, toolId);
    return;
  }

  if (existingAgent && updateAgent) {
    await updateAgentViaRest(existingAgent.id, buildRestConfig(toolId));
    log("AGENTE", [`Actualizado "${agentName}" → id ${existingAgent.id} (prompt + tool_ids re-aplicados).`]);
    finish(existingAgent.id, toolId);
    return;
  }

  const createdAgent = await createAgentViaRest(agentName, buildRestConfig(toolId));
  log("AGENTE", ["Creado " + agentName + " → id " + createdAgent.agentId]);
  finish(createdAgent.agentId, toolId);
}

// ---------------------------------------------------------------------------
// El enum `Llm` del SDK (v2.68.0) NO incluye eleven_turbo_v2_5 / eleven_flash_v2_5,
// por lo que agents.create/update fallan en validación de runtime aunque la API
// los acepta (requisito para agentes no-ingleses). Se usa fetch crudo al mismo
// endpoint REST; el resto del script sigue usando el SDK.
// ---------------------------------------------------------------------------
const REST_BASE = "https://api.elevenlabs.io";

function buildRestConfig(toolId: string) {
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
      first_message:
        "¡Hola! Soy el agente de FactorIA. ¿En qué puedo ayudarte? Puedo consultarte disponibilidad y precios.",
      language: "es",
      prompt: {
        prompt: SYSTEM_PROMPT,
        // LLM multilingüe explícito (disponible en free tier).
        llm: "gemini-2.5-flash",
        timezone: "America/Bogota",
        tool_ids: [toolId],
      },
    },
    // OBLIGATORIO para agentes no-ingleses: el TTS por defecto (eleven_flash_v2) es
    // solo inglés; con language="es" el servidor exige un modelo v2.5 (turbo o flash).
    tts: {
      model_id: "eleven_flash_v2_5",
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

function finish(agentId: string, toolId: string) {
  console.log("─────────────────────────────────────────────────────────────");
  console.log("\n  Siguientes pasos:\n");
  console.log(`  1. En .env.local pon:`);
  console.log(`       NEXT_PUBLIC_ELEVENLABS_AGENT_ID=${agentId}`);
  console.log(`       ELEVENLABS_API_KEY=<tu api key>`);
  console.log(`  2. npm run dev`);
  console.log(`  3. Abre http://localhost:3000 y usa el widget (voz) o la tarjeta de prueba.`);
  console.log(`\n  Tool webhook creada/vinculada: ${TOOL_NAME} (${toolId})`);
  console.log(
    `  -> En la consola de ElevenLabs (Agents → Tools) puedes verla; también aparece dentro del agente "${agentName}".`
  );
  console.log(
    `  -> Para probar el webhook directamente:\n     curl -X POST ${toolUrl}/api/tools/check-availability -H "Authorization: Bearer $FACTORIA_TOOL_SECRET" -H "Content-Type: application/json" -d '{"tenant_id":"bibo-park-one","user_name":"Valentina","date":"2026-10-05","category":"vip"}'`
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