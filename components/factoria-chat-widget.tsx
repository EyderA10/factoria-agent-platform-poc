"use client";

import {
  ConversationProvider,
  useConversationControls,
  useConversationInput,
  useConversationMode,
  useConversationStatus,
} from "@elevenlabs/react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

type MessageRole = "user" | "agent";

interface ChatMessage {
  id: number;
  role: MessageRole;
  text: string;
  tentative?: boolean;
}

interface WidgetProps {
  /** Agent ID de ElevenLabs (opcional si está definido en NEXT_PUBLIC_ELEVENLABS_AGENT_ID) */
  agentId?: string;
  /** Forzar el modo demo simulado (etiquetado). Por defecto se activa si falta configuración. */
  demo?: boolean;
  title?: string;
}

let nextId = 1;

export function FactorIAChatWidget({ agentId, demo, title = "FactorIA Agent" }: WidgetProps) {
  const [mode, setMode] = useState<"demo" | "real">(demo ? "demo" : "real");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [setupNeeded, setSetupNeeded] = useState(false);

  const demoAvailable = demo || process.env.NEXT_PUBLIC_FACTORIA_DEMO_MODE === "true";
  const canTryDemo = !demo && demoAvailable && setupNeeded;

  const pushMessage = useCallback((role: MessageRole, text: string, tentative = false) => {
    setMessages((prev) => {
      if (tentative) {
        const withoutPending = prev.filter((m) => !m.tentative);
        return [...withoutPending, { id: nextId++, role, text, tentative }];
      }
      return [...prev, { id: nextId++, role, text }];
    });
  }, []);

  const handleSdkMessage = useCallback(
    (props: { message?: string; role?: string }) => {
      const text = props.message?.trim();
      if (text) pushMessage(props.role === "user" ? "user" : "agent", text);
    },
    [pushMessage]
  );

  const handleSdkConnect = useCallback(() => {
    setError(null);
    setSetupNeeded(false);
    pushMessage("agent", "Conexión establecida. Puedes hablar o escribir tu consulta.");
  }, [pushMessage]);

  const handleSdkDisconnect = useCallback(() => {
    pushMessage("agent", "Conversación finalizada.");
  }, [pushMessage]);

  const handleSdkError = useCallback((err: unknown) => {
    const message = err instanceof Error ? err.message : String(err);
    setError(message || "Error en la conversación");
  }, []);

  if (setupNeeded && canTryDemo) {
    return (
      <SetupPanel
        title={title}
        onTryDemo={() => {
          setSetupNeeded(false);
          setMode("demo");
        }}
      />
    );
  }

  return (
    <ConversationProvider
      onMessage={handleSdkMessage}
      onError={handleSdkError}
      onConnect={handleSdkConnect}
      onDisconnect={handleSdkDisconnect}
    >
      <div className="fixed bottom-5 right-5 z-50 flex w-88 max-w-[calc(100vw-2.5rem)] flex-col overflow-hidden rounded-2xl border border-slate-800 bg-slate-900/95 text-white shadow-2xl backdrop-blur-md">
        <Header title={title} demo={mode === "demo"} />
        <MessageList messages={messages} error={error} />
        {mode === "real" ? (
          <RealControls
            agentId={agentId}
            pushMessage={pushMessage}
            onSetupNeeded={() => setSetupNeeded(true)}
          />
        ) : (
          <DemoControls pushMessage={pushMessage} />
        )}
      </div>
    </ConversationProvider>
  );
}

function Header({ title, demo }: { title: string; demo: boolean }) {
  return (
    <div className="flex items-center justify-between border-b border-slate-800 px-4 py-3">
      <div className="flex items-center gap-2">
        <span
          className={`h-2.5 w-2.5 rounded-full ${
            demo ? "bg-amber-400" : "bg-emerald-400 animate-pulse"
          }`}
        />
        <span className="text-sm font-semibold tracking-wide text-slate-100">{title}</span>
      </div>
      {demo ? (
        <span className="rounded-full bg-amber-500/20 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-amber-300">
          Demo simulada
        </span>
      ) : (
        <span className="rounded-full bg-slate-800 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider text-slate-400">
          ElevenLabs
        </span>
      )}
    </div>
  );
}

function MessageList({ messages, error }: { messages: ChatMessage[]; error: string | null }) {
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages, error]);

  return (
    <div ref={scrollRef} className="flex h-64 flex-col gap-2 overflow-y-auto bg-slate-950 p-3 text-xs">
      {messages.length === 0 && (
        <div className="flex h-full items-center justify-center px-6 text-center italic text-slate-500">
          {error
            ? "No se pudo iniciar la conversación."
            : "Haz clic en «Iniciar conversación» para probar el agente."}
        </div>
      )}

      {error && (
        <div className="rounded-lg border border-rose-500/40 bg-rose-500/10 p-2 text-[11px] text-rose-300">
          {error}
        </div>
      )}

      {messages.map((msg) => (
        <div
          key={msg.id}
          className={`max-w-[85%] rounded-lg px-2.5 py-2 ${msg.role === "agent" ? "bg-slate-800 text-slate-200" : "ml-auto bg-blue-600 text-white"} ${msg.tentative ? "opacity-50" : ""}`}
        >
          <span className="mb-0.5 block text-[9px] font-bold uppercase opacity-60">
            {msg.role === "agent" ? "Agente" : "Tú"}
          </span>
          {msg.text}
        </div>
      ))}
    </div>
  );
}

function RealControls({
  agentId,
  pushMessage,
  onSetupNeeded,
}: {
  agentId?: string;
  pushMessage: (role: MessageRole, text: string, tentative?: boolean) => void;
  onSetupNeeded: () => void;
}) {
  const { startSession, endSession, sendUserMessage, sendUserActivity } = useConversationControls();
  const { status } = useConversationStatus();
  const { isSpeaking } = useConversationMode();
  const { isMuted, setMuted } = useConversationInput();

  const [text, setText] = useState("");
  const [starting, setStarting] = useState(false);

  const connected = status === "connected";

  const userId = useMemo(() => {
    if (typeof window === "undefined") return "pending";
    const key = "factoria_user_id";
    let id = window.localStorage.getItem(key);
    if (!id) {
      id = `web_${Math.random().toString(36).slice(2, 10)}`;
      window.localStorage.setItem(key, id);
    }
    return id;
  }, []);

  const handleStart = useCallback(async () => {
    setStarting(true);
    try {
      try {
        await navigator.mediaDevices.getUserMedia({ audio: true });
      } catch {
        await navigator.mediaDevices.getUserMedia({ audio: true }).catch(() => {});
      }

      const res = await fetch(`/api/elevenlabs/session?agentId=${encodeURIComponent(agentId ?? "")}`);
      const body = (await res.json().catch(() => ({}))) as {
        signedUrl?: string;
        agentId?: string;
        error?: string;
      };

      if (!res.ok) {
        if (body.error === "not_configured") {
          onSetupNeeded();
        }
        throw new Error(body.error ?? "No se pudo obtener la sesión del agente");
      }

      if (body.signedUrl) {
        await startSession({ signedUrl: body.signedUrl, userId });
      } else if (body.agentId) {
        await startSession({ agentId: body.agentId, userId });
      } else {
        throw new Error("La sesión no devolvió agente ni signed URL");
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      pushMessage("agent", `Error al iniciar: ${message}`);
    } finally {
      setStarting(false);
    }
  }, [agentId, onSetupNeeded, pushMessage, startSession, userId]);

  const handleEnd = useCallback(async () => {
    try {
      await endSession();
    } catch {
      // sesión ya finalizada
    }
  }, [endSession]);

  const handleSend = useCallback(() => {
    const value = text.trim();
    if (!value || !connected) return;
    pushMessage("user", value);
    sendUserMessage(value);
    setText("");
  }, [connected, pushMessage, sendUserMessage, text]);

  const busy = starting || status === "connecting";

  // Mientras el usuario esté inactivo, resetea periódicamente el timeout de
  // turno de ElevenLabs (evento user_activity). Sin esto, el agente retoma el
  // turno tras el silencio y pregunta "¿sigues ahí?" / "¿algo más?". Con este
  // loop, el agente solo responde cuando el usuario envía texto o audio.
  useEffect(() => {
    if (!connected) return;
    const interval = setInterval(() => sendUserActivity(), 10_000);
    return () => clearInterval(interval);
  }, [connected, sendUserActivity]);

  return (
    <div className="flex flex-col gap-2 p-3">
      <div className="flex gap-1.5">
        <span className="rounded-md bg-slate-800 px-2 py-1 font-mono text-[10px] text-slate-400">
          {status}
          {connected && isSpeaking ? " · hablando" : ""}
        </span>
        {connected && (
          <button
            type="button"
            onClick={() => setMuted(!isMuted)}
            className="rounded-md bg-slate-800 px-2 py-1 text-[10px] font-medium text-slate-300 transition hover:bg-slate-700"
          >
            {isMuted ? "Desmutear" : "Mutear"}
          </button>
        )}
      </div>

      <div className="flex gap-1.5">
        {!connected ? (
          <button
            type="button"
            onClick={handleStart}
            disabled={busy}
            className="flex-1 rounded-xl bg-linear-to-r from-blue-600 to-indigo-600 py-2.5 text-xs font-semibold text-white shadow transition hover:from-blue-500 hover:to-indigo-500 active:scale-[0.98] disabled:opacity-60"
          >
            {starting ? "Conectando…" : "Iniciar conversación"}
          </button>
        ) : (
          <button
            type="button"
            onClick={handleEnd}
            className="flex-1 rounded-xl bg-rose-600 py-2.5 text-xs font-semibold text-white shadow transition hover:bg-rose-500 active:scale-[0.98]"
          >
            Finalizar
          </button>
        )}
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          handleSend();
        }}
        className="flex gap-1.5"
      >
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          disabled={!connected}
          placeholder={connected ? "Escribe al agente…" : "Conecta para hablar/escribir"}
          className="flex-1 rounded-lg border border-slate-700 bg-slate-800 px-2.5 py-2 text-xs text-white placeholder:text-slate-500 focus:border-blue-500 focus:outline-none disabled:opacity-50"
        />
        <button
          type="submit"
          disabled={!connected || !text.trim()}
          className="rounded-lg bg-slate-700 px-3 text-xs font-semibold transition hover:bg-slate-600 disabled:opacity-40"
        >
          Enviar
        </button>
      </form>
    </div>
  );
}

type DemoReply = { role: MessageRole; text: string };

function buildDemoReply(input: string, option?: string): DemoReply {
  const text = input.toLowerCase();

  if (text.includes("categor") || text.includes("vip") || text.includes("premium")) {
    const category = text.includes("vip") ? "vip" : text.includes("premium") ? "premium" : "general";
    const prices: Record<string, string> = { general: "15 USD", premium: "25 USD", vip: "35 USD" };
    return {
      role: "agent",
      text: `[tool: check_availability] confirmé disponibilidad para la categoría ${category}` +
        `\n• Precio por entrada: ${prices[category]}\n• Horarios: 10:00 AM, 12:30 PM, 04:00 PM\n` +
        `(Demo simulada — sin ElevenLabs. Con el agente real, esta frase la diría el LLM con voz.)`,
    };
  }
  if (text.includes("precio") || text.includes("valor") || text.includes("cuánto")) {
    return {
      role: "agent",
      text: "Las categorías disponibles son general (15 USD), premium (25 USD) y vip (35 USD). (Demo simulada)",
    };
  }
  if (text.includes("agente") || text.includes("humano") || text.includes("persona")) {
    return {
      role: "agent",
      text: "Puedo transferirte a un humano. En phone/WhatsApp se usa el system tool «Transfer to number». (Demo simulada)",
    };
  }
  if (option === "welcome") {
    return {
      role: "agent",
      text: "¡Hola! Soy el agente de FactorIA. Pregúntame por disponibilidad, precios u horarios. (Demo simulada)",
    };
  }
  return {
    role: "agent",
    text: "Soy una demo simulada (sin ElevenLabs). Conecta un agente real para probar voz y tools de verdad. (Demo simulada)",
  };
}

function DemoControls({ pushMessage }: { pushMessage: (role: MessageRole, text: string, tentative?: boolean) => void }) {
  const [text, setText] = useState("");
  const [thinking, setThinking] = useState(false);
  const startedRef = useRef(false);

  useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;
    const t = setTimeout(() => {
      const reply = buildDemoReply("", "welcome");
      pushMessage(reply.role, reply.text);
    }, 400);
    return () => clearTimeout(t);
  }, [pushMessage]);

  const handleSend = () => {
    const value = text.trim();
    if (!value || thinking) return;
    pushMessage("user", value);
    setThinking(true);
    setText("");
    setTimeout(() => {
      pushMessage("agent", "Consultando disponibilidad…", true);
      setTimeout(() => {
        pushMessage("agent", "Consultando disponibilidad…", true); // no-op para limpiar placeholder
        const reply = buildDemoReply(value);
        pushMessage(reply.role, reply.text);
        setThinking(false);
      }, 900);
    }, 300);
  };

  return (
    <div className="flex flex-col gap-2 p-3">
      <div className="rounded-md bg-amber-500/10 px-2 py-1.5 text-[10px] leading-relaxed text-amber-200/90">
        Modo demo: flujo simulado del patrón <code className="font-mono">Agente → webhook → FactorIA</code>. No se
        consumo créditos ni se conecta a ElevenLabs.
      </div>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          handleSend();
        }}
        className="flex gap-1.5"
      >
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Pregunta por disponibilidad, por ejemplo: «¿hay vip para mañana?»"
          className="flex-1 rounded-lg border border-slate-700 bg-slate-800 px-2.5 py-2 text-xs text-white placeholder:text-slate-500 focus:border-amber-500 focus:outline-none"
        />
        <button
          type="submit"
          disabled={!text.trim() || thinking}
          className="rounded-lg bg-slate-700 px-3 text-xs font-semibold transition hover:bg-slate-600 disabled:opacity-40"
        >
          Enviar
        </button>
      </form>
    </div>
  );
}

function SetupPanel({ title, onTryDemo }: { title: string; onTryDemo: () => void }) {
  return (
    <div className="fixed bottom-5 right-5 z-50 flex w-88 max-w-[calc(100vw-2.5rem)] flex-col gap-3 rounded-2xl border border-slate-800 bg-slate-900/95 p-4 text-white shadow-2xl backdrop-blur-md">
      <div className="text-sm font-semibold text-slate-100">{title} — sin configurar</div>
      <ol className="list-decimal space-y-1.5 pl-5 text-xs text-slate-300">
        <li>Obtén tu API key: ElevenLabs → Dashboard → API Keys.</li>
        <li>
          Crea el agente y la tool: <code className="font-mono text-emerald-400">npm run setup</code> (guarda el
          Agent ID que imprime).
        </li>
        <li>
          Copia <code className="font-mono text-emerald-400">.env.example</code> a{" "}
          <code className="font-mono text-emerald-400">.env.local</code> y rellena{" "}
          <code className="font-mono">ELEVENLABS_API_KEY</code> y{" "}
          <code className="font-mono">NEXT_PUBLIC_ELEVENLABS_AGENT_ID</code>.
        </li>
        <li>Reinicia el dev server y vuelve a «Iniciar conversación».</li>
      </ol>
      <button
        type="button"
        onClick={onTryDemo}
        className="rounded-xl border border-amber-500/40 bg-amber-500/10 py-2 text-xs font-semibold text-amber-300 transition hover:bg-amber-500/20"
      >
        Probar demo simulada
      </button>
    </div>
  );
}