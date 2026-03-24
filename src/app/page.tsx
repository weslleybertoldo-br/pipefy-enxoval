"use client";

import { useState, useCallback, useRef } from "react";

interface CardResult {
  code: string;
  status: "pending" | "processing" | "success" | "error";
  message?: string;
  recordId?: string;
}

export default function Home() {
  const [codesInput, setCodesInput] = useState("");
  const [results, setResults] = useState<CardResult[]>([]);
  const [processing, setProcessing] = useState(false);
  const abortRef = useRef(false);

  const processCards = useCallback(async () => {
    const codes = codesInput
      .split(/[\n,;]+/)
      .map((c) => c.trim())
      .filter(Boolean);

    if (codes.length === 0) return;

    abortRef.current = false;
    setProcessing(true);

    // Initialize all as pending
    const initial: CardResult[] = codes.map((code) => ({
      code,
      status: "pending",
    }));
    setResults(initial);

    // Process one by one
    for (let i = 0; i < codes.length; i++) {
      if (abortRef.current) break;

      // Set current as processing
      setResults((prev) =>
        prev.map((r, idx) => (idx === i ? { ...r, status: "processing" } : r))
      );

      try {
        const res = await fetch("/api/process-card", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ code: codes[i] }),
        });

        const data = await res.json();

        if (data.success) {
          setResults((prev) =>
            prev.map((r, idx) =>
              idx === i
                ? {
                    ...r,
                    status: "success",
                    message: `Registro #${data.recordId} criado`,
                    recordId: data.recordId,
                  }
                : r
            )
          );
        } else {
          setResults((prev) =>
            prev.map((r, idx) =>
              idx === i
                ? { ...r, status: "error", message: data.error }
                : r
            )
          );
        }
      } catch {
        setResults((prev) =>
          prev.map((r, idx) =>
            idx === i
              ? { ...r, status: "error", message: "Erro de conexão" }
              : r
          )
        );
      }
    }

    setProcessing(false);
  }, [codesInput]);

  const stopProcessing = () => {
    abortRef.current = true;
  };

  const completed = results.filter((r) => r.status === "success").length;
  const errors = results.filter((r) => r.status === "error").length;
  const total = results.length;
  const progress = total > 0 ? ((completed + errors) / total) * 100 : 0;

  return (
    <div className="max-w-4xl mx-auto p-6">
      <header className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900">Pipefy Enxoval</h1>
        <p className="text-gray-500 mt-1">
          Automação de registro de enxoval — Seazone
        </p>
      </header>

      {/* Input */}
      <section className="bg-white rounded-lg shadow p-6 mb-6">
        <h2 className="text-lg font-semibold mb-2">Códigos dos Imóveis</h2>
        <p className="text-sm text-gray-500 mb-4">
          Cole os códigos (um por linha ou separados por vírgula). O sistema vai
          buscar o card, encontrar o PDF de enxoval nos anexos, ler, preencher e
          criar o registro automaticamente.
        </p>
        <textarea
          value={codesInput}
          onChange={(e) => setCodesInput(e.target.value)}
          placeholder={"ALA0004\nALA0005\nRSO0022"}
          rows={5}
          disabled={processing}
          className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-100"
        />
        <div className="flex gap-3 mt-4">
          <button
            onClick={processCards}
            disabled={processing || !codesInput.trim()}
            className="bg-blue-600 text-white px-6 py-3 rounded-md font-medium hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {processing ? "Processando..." : "Processar Todos"}
          </button>
          {processing && (
            <button
              onClick={stopProcessing}
              className="bg-red-500 text-white px-6 py-3 rounded-md font-medium hover:bg-red-600 transition-colors"
            >
              Parar
            </button>
          )}
        </div>
      </section>

      {/* Progress */}
      {results.length > 0 && (
        <section className="bg-white rounded-lg shadow p-6 mb-6">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-lg font-semibold">Progresso</h2>
            <span className="text-sm text-gray-500">
              {completed + errors}/{total}
              {completed > 0 && (
                <span className="text-green-600 ml-2">{completed} OK</span>
              )}
              {errors > 0 && (
                <span className="text-red-600 ml-2">{errors} erro(s)</span>
              )}
            </span>
          </div>

          {/* Progress bar */}
          <div className="w-full bg-gray-200 rounded-full h-3 mb-6">
            <div
              className="h-3 rounded-full transition-all duration-300"
              style={{
                width: `${progress}%`,
                backgroundColor: errors > 0 && completed === 0 ? "#ef4444" : "#3b82f6",
              }}
            />
          </div>

          {/* Results list */}
          <div className="space-y-2">
            {results.map((r, idx) => (
              <div
                key={idx}
                className={`flex items-center justify-between px-4 py-3 rounded-md border ${
                  r.status === "success"
                    ? "bg-green-50 border-green-200"
                    : r.status === "error"
                    ? "bg-red-50 border-red-200"
                    : r.status === "processing"
                    ? "bg-blue-50 border-blue-200"
                    : "bg-gray-50 border-gray-200"
                }`}
              >
                <div className="flex items-center gap-3">
                  {/* Status icon */}
                  <span className="text-lg">
                    {r.status === "success" && "✅"}
                    {r.status === "error" && "❌"}
                    {r.status === "processing" && (
                      <span className="inline-block animate-spin">⏳</span>
                    )}
                    {r.status === "pending" && "⏸️"}
                  </span>
                  <span className="font-mono font-medium text-sm">
                    {r.code}
                  </span>
                </div>
                <span className="text-xs text-gray-600 max-w-md text-right">
                  {r.status === "processing" && "Processando..."}
                  {r.status === "pending" && "Aguardando"}
                  {r.message}
                </span>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
