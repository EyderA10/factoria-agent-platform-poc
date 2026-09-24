import { FactorIAChatWidget } from "@/components/factoria-chat-widget";
import { ToolTestCard } from "@/components/tool-test-card";

const STEPS = [
  {
    n: "01",
    title: "Canales de entrada",
    body: "Web chat (probado) · WhatsApp (Meta WABA) y llamadas (Twilio / SIP) requieren credenciales del cliente. Un solo agente omnicanal.",
  },
  {
    n: "02",
    title: "ElevenLabs Conversational AI",
    body: "STT + LLM + TTS en una conversación. Webhook Tools con autenticación Bearer hacia FactorIA.",
  },
  {
    n: "03",
    title: "FactorIA Tool Layer",
    body: "Contratos Zod, validación, auth y lógica de negocio. Reutilizable también por agentes internos (Vercel AI SDK).",
  },
  {
    n: "04",
    title: "Sistemas del cliente",
    body: "Reservas, ticketing, CRM, horarios… la app del cliente expone sus capacidades como tools reutilizables.",
  },
];

export default function HomePage() {
  const agentId = process.env.NEXT_PUBLIC_ELEVENLABS_AGENT_ID;
  const baseUrl = process.env.NEXT_PUBLIC_FACTORIA_BASE_URL ?? "http://localhost:3000";

  return (
    <main className="flex min-h-screen flex-col items-center px-6 py-16">
      <div className="w-full max-w-4xl space-y-12">
        <header className="text-center">
          <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-slate-800 bg-slate-900 px-3 py-1 text-[11px] text-slate-400">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
            Spike / POC — ElevenLabs Conversational AI + FactorIA Tool Layer
          </div>
          <h1 className="bg-linear-to-r from-blue-400 to-indigo-400 bg-clip-text text-4xl font-extrabold tracking-tight text-transparent">
            FactorIA Agent Platform
          </h1>
          <p className="mx-auto mt-3 max-w-2xl text-sm leading-relaxed text-slate-400">
            Validación del patrón omnicanal:{" "}
            <span className="text-slate-200">Web / WhatsApp / Phone → Agente → FactorIA Tool Layer →</span>{" "}
            sistemas del cliente. El código de esta página confirma el flujo de webhook tools y la UI reutilizable
            de FactorIA.
          </p>
        </header>

        <section className="grid gap-4 sm:grid-cols-2">
          {STEPS.map((step) => (
            <div key={step.n} className="rounded-2xl border border-slate-800 bg-slate-900/60 p-5">
              <div className="mb-2 font-mono text-[11px] text-blue-400">{step.n}</div>
              <h2 className="text-sm font-semibold text-slate-100">{step.title}</h2>
              <p className="mt-1.5 text-xs leading-relaxed text-slate-400">{step.body}</p>
            </div>
          ))}
        </section>

        <section className="grid gap-6 lg:grid-cols-2">
          <ToolTestCard />
          <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-5 text-left">
            <h2 className="mb-3 text-sm font-semibold text-slate-100">Estado de la POC</h2>
            <ul className="space-y-2.5 text-xs text-slate-400">
              <li className="flex flex-wrap items-center gap-2">
                <span className="rounded bg-slate-800 px-1.5 py-0.5 font-mono text-[10px] text-emerald-400">
                  POST /api/tools/check-availability
                </span>
                Webhook Tool (Bearer + Zod). Lista para ElevenLabs.
              </li>
              <li className="flex flex-wrap items-center gap-2">
                <span className="rounded bg-slate-800 px-1.5 py-0.5 font-mono text-[10px] text-emerald-400">
                  GET /api/elevenlabs/session
                </span>
                Signed URL server-side (sin exponer la API key).
              </li>
              <li className="flex flex-wrap items-center gap-2">
                <span className="rounded bg-slate-800 px-1.5 py-0.5 font-mono text-[10px] text-emerald-400">
                  POST /api/telephony/outbound-call
                </span>
                Demo outbound vía Twilio (requiere número importado).
              </li>
              <li className="flex flex-wrap items-center gap-2">
                <span className="rounded bg-slate-800 px-1.5 py-0.5 font-mono text-[10px] text-emerald-400">
                  npm run setup
                </span>
                Provisiona por cliente: `npm run setup -- --client {"<id>"}` (idempotente).
              </li>
            </ul>
            <div className="mt-4 rounded-xl border border-slate-800 bg-slate-950 p-3 font-mono text-[10px] leading-relaxed text-slate-500">
              curl -X POST {baseUrl}/api/tools/check-availability
              <br />
              -H &apos;Authorization: Bearer $FACTORIA_TOOL_SECRET&apos;
              <br />
              -H &apos;Content-Type: application/json&apos; \
              <br />
              -d &apos;{`{"tenant_id":"bibo-park-one","user_name":"Valentina","date":"2026-10-05","category":"vip"}`}&apos;
            </div>
          </div>
        </section>

        <section className="rounded-2xl border border-slate-800 bg-slate-900/60 p-5 text-left text-xs text-slate-400">
          <h2 className="mb-2 text-sm font-semibold text-slate-100">Widget de voz de FactorIA</h2>
          <p>
            UI propia construida sobre <code className="font-mono text-emerald-400">@elevenlabs/react</code> ({" "}
            <code className="font-mono">useConversation</code> + <code className="font-mono">ConversationProvider</code>
            ). Usa la signed URL generada por el servidor. Abajo tienes el widget activo; si no está configurado, usa el
            modo demo etiquetado.
          </p>
          {agentId ? (
            <p className="mt-2 text-[11px] text-slate-500">
              Agente configurado: <code className="font-mono text-emerald-400">{agentId}</code>
            </p>
          ) : (
            <p className="mt-2 text-[11px] text-amber-300/80">
              Agente no configurado (NEXT_PUBLIC_ELEVENLABS_AGENT_ID). El widget queda en modo demo simulada.
            </p>
          )}
        </section>
      </div>

      <FactorIAChatWidget agentId={agentId} />
    </main>
  );
}