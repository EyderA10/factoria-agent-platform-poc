"use client";

import { useCallback, useState } from "react";

/**
 * Tarjeta para probar la FactorIA Tool Layer desde el navegador.
 * Llama al endpoint de demo del POC (misma lógica que el webhook de ElevenLabs,
 * sin exponer el secreto). Útil para validar el contrato JSON sin un agente.
 */
export function ToolTestCard() {
  const [input, setInput] = useState({
    tenant_id: "bibo-park-one",
    user_name: "Valentina",
    date: "2026-10-05",
    category: "vip",
  });
  const [result, setResult] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [running, setRunning] = useState(false);

  const run = useCallback(async () => {
    setRunning(true);
    setStatus(null);
    setResult(null);
    try {
      const res = await fetch("/api/poc/test-tool", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      });
      const body = await res.json();
      setStatus(`${res.status} ${res.ok ? "OK" : "ERROR"}`);
      setResult(JSON.stringify(body, null, 2));
    } catch (err) {
      setStatus("NETWORK ERROR");
      setResult(err instanceof Error ? err.message : String(err));
    } finally {
      setRunning(false);
    }
  }, [input]);

  const fields: { key: keyof typeof input; label: string }[] = [
    { key: "tenant_id", label: "Tenant" },
    { key: "user_name", label: "Usuario" },
    { key: "date", label: "Fecha" },
    { key: "category", label: "Categoría" },
  ];

  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-5 text-left">
      <h2 className="mb-1 text-sm font-semibold text-slate-100">Probar la FactorIA Tool Layer</h2>
      <p className="mb-4 text-xs text-slate-400">
        Simula la llamada que haría el agente de ElevenLabs (webhook tool →
        <code className="font-mono text-emerald-400">/api/tools/check-availability</code>) usando el mismo contrato
        Zod.
      </p>

      <div className="grid grid-cols-2 gap-3">
        {fields.map(({ key, label }) => (
          <label key={key} className="flex flex-col gap-1 text-[11px] font-medium text-slate-400">
            {label}
            <input
              value={input[key]}
              onChange={(e) => setInput((prev) => ({ ...prev, [key]: e.target.value }))}
              className="rounded-lg border border-slate-700 bg-slate-800 px-2.5 py-1.5 font-mono text-xs text-slate-100 focus:border-blue-500 focus:outline-none"
            />
          </label>
        ))}
      </div>

      <button
        type="button"
        onClick={run}
        disabled={running}
        className="mt-4 w-full rounded-xl bg-linear-to-r from-blue-600 to-indigo-600 py-2 text-xs font-semibold text-white transition hover:from-blue-500 hover:to-indigo-500 disabled:opacity-60"
      >
        {running ? "Ejecutando…" : "Ejecutar tool"}
      </button>

      {status && (
        <div className="mt-3">
          <div className="text-[11px]">
            Estado: <span className={status.endsWith("OK") ? "text-emerald-400" : "text-rose-400"}>{status}</span>
          </div>
          <pre className="mt-1.5 max-h-48 overflow-auto rounded-lg bg-slate-950 p-2.5 text-[11px] leading-relaxed text-emerald-300">
            {result}
          </pre>
        </div>
      )}
    </div>
  );
}