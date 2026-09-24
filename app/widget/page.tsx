import { FactorIAChatWidget } from "@/components/factoria-chat-widget";

export const metadata = {
  title: "FactorIA Widget — Demo",
  description: "Widget de voz/chat reutilizable de FactorIA sobre ElevenLabs Conversational AI.",
};

export default function WidgetPage() {
  const agentId = process.env.NEXT_PUBLIC_ELEVENLABS_AGENT_ID;
  const demoMode = process.env.NEXT_PUBLIC_FACTORIA_DEMO_MODE === "true";

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-950 p-6">
      <div className="max-w-xl text-center">
        <h1 className="text-2xl font-bold text-slate-100">Widget reutilizable de FactorIA</h1>
        <p className="mt-2 text-sm text-slate-400">
          Componente <code className="font-mono text-emerald-400">FactorIAChatWidget</code> listo para embeber en
          cualquier página del cliente. Voz WebRTC + texto.
        </p>
        <p className="mt-2 text-xs text-slate-500">
          {agentId
            ? `Conectando al agente ${agentId}`
            : `Modo ${demoMode ? "demo simulada" : "sin configurar"} (define NEXT_PUBLIC_ELEVENLABS_AGENT_ID para el modo real).`}
        </p>
      </div>
      <FactorIAChatWidget agentId={agentId} />
    </main>
  );
}