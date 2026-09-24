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
  const opts: Record<string, string | boolean> = { dryRun: false, updateAgent: false };
  const positional: string[] = [];
  for (const arg of argv) {
    if (arg === "--dry-run") opts.dryRun = true;
    else if (arg === "--update-agent") opts.updateAgent = true;
    else if (arg === "--help") opts.help = true;
    else if (arg === "--agent-name") opts.agentName = "";
    else if (opts.agentName === "") opts.agentName = arg;
    else if (arg.startsWith("--agent-name=")) opts.agentName = arg.split("=")[1];
    else if (arg.startsWith("--tool-url=")) opts.toolUrl = arg.split("=")[1];
    else if (arg.startsWith("--secret=")) opts.secret = arg.split("=")[1];
    else positional.push(arg);
  }
  return opts;
}

const args = parseArgs(process.argv.slice(2));
const dryRun = Boolean(args.dryRun);
const updateAgent = Boolean(args.updateAgent);
const agentName = String(args.agentName ?? "Factoria POC Agent");
const toolUrl = String(args.toolUrl ?? env.NEXT_PUBLIC_FACTORIA_BASE_URL ?? "http://localhost:3000").replace(/\/$/, "");
const toolSecret = String(args.secret ?? env.FACTORIA_TOOL_SECRET ?? "factoria-secret-token-2026");
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
6. Tras responder, QUÉDATE EN SILENCIO a la espera de que el usuario hable o escriba. No hagas preguntas de relleno ni cierres de turno tipo "¿Hay algo más en lo que pueda ayudarte?".
7. Responde únicamente cuando el usuario se comunique, de forma breve y natural.
8. Despídete de forma breve solo si el usuario se despide o pide terminar.`;

function toolApiSchema(toolEndpoint: string) {
  return {
    url: `${toolEndpoint}/api/tools/check-availability`,
    method: "POST" as const,
    contentType: "application/json" as const,
    requestHeaders: {
      Authorization: `Bearer ${toolSecret}`,
    },
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
--update-agent       Si el agente ya existe, forzar update (re-aplica prompt + tools).
--help               Esta ayuda.
`);
    return;
  }

  const toolVisibleUrl = `${toolUrl}/api/tools/check-availability`;
  const secretLabel = toolSecret === "factoria-secret-token-2026" ? " (default de desarrollo)" : "";
  console.log(`\nfactorIA POC · ElevenLabs provisioning\n`);
  console.log(`  agent  : ${agentName}`);
  console.log(`  tool   : ${TOOL_NAME} → ${toolVisibleUrl}`);
  console.log(`  auth   : Bearer <FACTORIA_TOOL_SECRET>${secretLabel}`);
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

  if (dryRun || !client) {
    log("DRY-RUN: tool", [
      `POST ${toolVisibleUrl}`,
      `headers: { Authorization: "Bearer <FACTORIA_TOOL_SECRET>" }`,
      `body: { tenant_id?, user_name?, date, category }`,
    ]);
    const draft = buildRestConfig(TOOL_ID);
    console.log("JSON de conversation_config (snake_case, vía REST) que se enviaría:\n", JSON.stringify(draft, null, 2));
    return;
  }

  // ---- 1. Tool ----
  let toolId: string;
  const existingTool = (await findAllTools(client)).find((t) => t.name === TOOL_NAME);
  if (existingTool) {
    toolId = existingTool.id;
    log("TOOL", ["Ya existe: " + TOOL_NAME + " → id " + toolId, "Se reutiliza (no se modifica)."]);
  } else {
    const created = await client.conversationalAi.tools.create({
      toolConfig: {
        type: "webhook",
        name: TOOL_NAME,
        description:
          "Consulta disponibilidad y precio de entradas del tenant. Úsala cuando el usuario pregunte por disponibilidad, precios u horarios.",
        apiSchema: toolApiSchema(toolUrl),
      },
    });
    toolId = created.id;
    log("TOOL", ["Creada " + TOOL_NAME + " → id " + toolId, `URL: ${toolVisibleUrl}`, `Auth: Authorization: Bearer <secreto>`]);
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
    turn: {
      turn_timeout: 20,
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