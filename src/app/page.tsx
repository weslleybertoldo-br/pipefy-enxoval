"use client";

import { useState, useCallback, useRef, useEffect } from "react";

// =====================
// TYPES
// =====================

interface CardResult {
  code: string;
  status: "pending" | "processing" | "success" | "error";
  message?: string;
  recordId?: string;
}

interface UpdateCardInfo {
  id: string;
  title: string;
  labels: string[];
  skip: boolean;
  skipReason: string;
  assignees: string[];
  due_date: string | null;
}

interface UpdateResult {
  cardId: string;
  title: string;
  action: "pending" | "processing" | "skipped" | "updated" | "error";
  details: string;
}

// =====================
// LOGIN SCREEN
// =====================

function LoginScreen({ onLogin }: { onLogin: () => void }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleLogin = async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const data = await res.json();
      if (data.success) {
        onLogin();
      } else {
        setError(data.error || "Email ou senha incorretos");
      }
    } catch {
      setError("Erro de conexão");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
      <div className="bg-white rounded-lg shadow-lg p-8 w-full max-w-sm">
        <h1 className="text-2xl font-bold text-gray-900 mb-1">Pipefy Enxoval</h1>
        <p className="text-sm text-gray-500 mb-6">Faça login para acessar</p>
        <input
          type="email"
          placeholder="Email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && document.getElementById("pwd")?.focus()}
          className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm mb-3 focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
        <input
          id="pwd"
          type="password"
          placeholder="Senha"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleLogin()}
          className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm mb-4 focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
        {error && <p className="text-red-600 text-sm mb-3">{error}</p>}
        <button
          onClick={handleLogin}
          disabled={loading || !email || !password}
          className="w-full bg-blue-600 text-white py-2.5 rounded-md font-medium hover:bg-blue-700 disabled:opacity-50 transition-colors"
        >
          {loading ? "Entrando..." : "Entrar"}
        </button>
      </div>
    </div>
  );
}

// =====================
// TAB: PROCESSAMENTO (existente)
// =====================

function TabProcessamento() {
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

    const initial: CardResult[] = codes.map((code) => ({ code, status: "pending" }));
    setResults(initial);

    for (let i = 0; i < codes.length; i++) {
      if (abortRef.current) break;

      setResults((prev) => prev.map((r, idx) => (idx === i ? { ...r, status: "processing" } : r)));

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
              idx === i ? { ...r, status: "success", message: `Registro #${data.recordId} criado`, recordId: data.recordId } : r
            )
          );
        } else {
          setResults((prev) => prev.map((r, idx) => (idx === i ? { ...r, status: "error", message: data.error } : r)));
        }
      } catch {
        setResults((prev) => prev.map((r, idx) => (idx === i ? { ...r, status: "error", message: "Erro de conexão" } : r)));
      }
    }
    setProcessing(false);
  }, [codesInput]);

  const completed = results.filter((r) => r.status === "success").length;
  const errors = results.filter((r) => r.status === "error").length;
  const total = results.length;
  const progress = total > 0 ? ((completed + errors) / total) * 100 : 0;

  return (
    <>
      <section className="bg-white rounded-lg shadow p-6 mb-6">
        <h2 className="text-lg font-semibold mb-2">Códigos dos Imóveis</h2>
        <p className="text-sm text-gray-500 mb-4">
          Cole os códigos (um por linha ou separados por vírgula). O sistema vai buscar o card, encontrar o PDF de enxoval nos anexos, ler, preencher e criar o registro automaticamente.
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
          <button onClick={processCards} disabled={processing || !codesInput.trim()} className="bg-blue-600 text-white px-6 py-3 rounded-md font-medium hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors">
            {processing ? "Processando..." : "Processar Todos"}
          </button>
          {processing && (
            <button onClick={() => { abortRef.current = true; }} className="bg-red-500 text-white px-6 py-3 rounded-md font-medium hover:bg-red-600 transition-colors">
              Parar
            </button>
          )}
        </div>
      </section>

      {results.length > 0 && (
        <section className="bg-white rounded-lg shadow p-6 mb-6">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-lg font-semibold">Progresso</h2>
            <span className="text-sm text-gray-500">
              {completed + errors}/{total}
              {completed > 0 && <span className="text-green-600 ml-2">{completed} OK</span>}
              {errors > 0 && <span className="text-red-600 ml-2">{errors} erro(s)</span>}
            </span>
          </div>
          <div className="w-full bg-gray-200 rounded-full h-3 mb-6">
            <div className="h-3 rounded-full transition-all duration-300" style={{ width: `${progress}%`, backgroundColor: errors > 0 && completed === 0 ? "#ef4444" : "#3b82f6" }} />
          </div>
          <div className="space-y-2">
            {results.map((r, idx) => (
              <div key={idx} className={`flex items-center justify-between px-4 py-3 rounded-md border ${r.status === "success" ? "bg-green-50 border-green-200" : r.status === "error" ? "bg-red-50 border-red-200" : r.status === "processing" ? "bg-blue-50 border-blue-200" : "bg-gray-50 border-gray-200"}`}>
                <div className="flex items-center gap-3">
                  <span className="text-lg">
                    {r.status === "success" && "✅"}
                    {r.status === "error" && "❌"}
                    {r.status === "processing" && <span className="inline-block animate-spin">⏳</span>}
                    {r.status === "pending" && "⏸️"}
                  </span>
                  <span className="font-mono font-medium text-sm">{r.code}</span>
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
    </>
  );
}

// =====================
// TAB: ATUALIZAÇÃO DE CARDS
// =====================

function TabUpdateCards({ apiRoute, phaseName, phaseDescription }: { apiRoute: string; phaseName: string; phaseDescription: string }) {
  const [cards, setCards] = useState<UpdateCardInfo[]>([]);
  const [results, setResults] = useState<UpdateResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [phaseInfo, setPhaseInfo] = useState<{ totalCards: number; toUpdate: number; toSkip: number } | null>(null);
  const [error, setError] = useState("");
  const abortRef = useRef(false);

  const loadCards = async () => {
    setLoading(true);
    setError("");
    setResults([]);
    try {
      const res = await fetch(apiRoute);
      const data = await res.json();
      if (data.success) {
        setCards(data.cards);
        setPhaseInfo({ totalCards: data.totalCards, toUpdate: data.toUpdate, toSkip: data.toSkip });
      } else {
        setError(data.error || "Erro ao carregar cards");
      }
    } catch {
      setError("Erro de conexão");
    } finally {
      setLoading(false);
    }
  };

  // Processar cards um a um
  const processAll = async () => {
    const toProcess = cards.filter((c) => !c.skip);
    if (toProcess.length === 0) return;

    abortRef.current = false;
    setProcessing(true);

    // Iniciar todos como pending
    const initial: UpdateResult[] = toProcess.map((c) => ({
      cardId: c.id,
      title: c.title,
      action: "pending",
      details: "",
    }));
    setResults(initial);

    for (let i = 0; i < toProcess.length; i++) {
      if (abortRef.current) break;

      // Marcar como processing
      setResults((prev) => prev.map((r, idx) => (idx === i ? { ...r, action: "processing", details: "Processando..." } : r)));

      try {
        const res = await fetch(apiRoute, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ cardId: toProcess[i].id }),
        });
        const data = await res.json();

        setResults((prev) =>
          prev.map((r, idx) =>
            idx === i ? { ...r, action: data.action || "error", details: data.details || data.error || "Erro desconhecido" } : r
          )
        );
      } catch {
        setResults((prev) => prev.map((r, idx) => (idx === i ? { ...r, action: "error", details: "Erro de conexão" } : r)));
      }
    }
    setProcessing(false);
  };

  const updated = results.filter((r) => r.action === "updated").length;
  const errored = results.filter((r) => r.action === "error").length;
  const total = results.length;
  const progress = total > 0 ? ((updated + errored) / total) * 100 : 0;

  return (
    <>
      {/* Controles */}
      <section className="bg-white rounded-lg shadow p-6 mb-6">
        <h2 className="text-lg font-semibold mb-2">Atualização de Cards — {phaseName}</h2>
        <p className="text-sm text-gray-500 mb-4" dangerouslySetInnerHTML={{ __html: phaseDescription }} />

        <div className="flex gap-3">
          <button
            onClick={loadCards}
            disabled={loading || processing}
            className="bg-gray-600 text-white px-6 py-3 rounded-md font-medium hover:bg-gray-700 disabled:opacity-50 transition-colors"
          >
            {loading ? "Carregando..." : "Carregar Cards"}
          </button>

          {cards.length > 0 && (
            <button
              onClick={processAll}
              disabled={processing || loading}
              className="bg-blue-600 text-white px-6 py-3 rounded-md font-medium hover:bg-blue-700 disabled:opacity-50 transition-colors"
            >
              {processing ? "Processando..." : `Atualizar ${phaseInfo?.toUpdate || 0} Cards`}
            </button>
          )}

          {processing && (
            <button
              onClick={() => { abortRef.current = true; }}
              className="bg-red-500 text-white px-6 py-3 rounded-md font-medium hover:bg-red-600 transition-colors"
            >
              Parar
            </button>
          )}
        </div>

        {error && <p className="text-red-600 text-sm mt-3">{error}</p>}
      </section>

      {/* Resumo */}
      {phaseInfo && (
        <section className="bg-white rounded-lg shadow p-6 mb-6">
          <h2 className="text-lg font-semibold mb-3">Resumo</h2>
          <div className="grid grid-cols-3 gap-4">
            <div className="text-center p-3 bg-gray-50 rounded-lg">
              <div className="text-2xl font-bold text-gray-900">{phaseInfo.totalCards}</div>
              <div className="text-xs text-gray-500">Total na {phaseName}</div>
            </div>
            <div className="text-center p-3 bg-blue-50 rounded-lg">
              <div className="text-2xl font-bold text-blue-600">{phaseInfo.toUpdate}</div>
              <div className="text-xs text-gray-500">Para atualizar</div>
            </div>
            <div className="text-center p-3 bg-yellow-50 rounded-lg">
              <div className="text-2xl font-bold text-yellow-600">{phaseInfo.toSkip}</div>
              <div className="text-xs text-gray-500">Ignorados (com tag)</div>
            </div>
          </div>
        </section>
      )}

      {/* Progresso */}
      {results.length > 0 && (
        <section className="bg-white rounded-lg shadow p-6 mb-6">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-lg font-semibold">Progresso</h2>
            <span className="text-sm text-gray-500">
              {updated + errored}/{total}
              {updated > 0 && <span className="text-green-600 ml-2">{updated} atualizados</span>}
              {errored > 0 && <span className="text-red-600 ml-2">{errored} erro(s)</span>}
            </span>
          </div>
          <div className="w-full bg-gray-200 rounded-full h-3 mb-6">
            <div className="h-3 rounded-full transition-all duration-300" style={{ width: `${progress}%`, backgroundColor: errored > 0 && updated === 0 ? "#ef4444" : "#3b82f6" }} />
          </div>
          <div className="space-y-2">
            {results.map((r, idx) => (
              <div key={idx} className={`flex items-center justify-between px-4 py-3 rounded-md border ${r.action === "updated" ? "bg-green-50 border-green-200" : r.action === "error" ? "bg-red-50 border-red-200" : r.action === "processing" ? "bg-blue-50 border-blue-200" : r.action === "skipped" ? "bg-yellow-50 border-yellow-200" : "bg-gray-50 border-gray-200"}`}>
                <div className="flex items-center gap-3">
                  <span className="text-lg">
                    {r.action === "updated" && "✅"}
                    {r.action === "error" && "❌"}
                    {r.action === "skipped" && "⏭️"}
                    {r.action === "processing" && <span className="inline-block animate-spin">⏳</span>}
                    {r.action === "pending" && "⏸️"}
                  </span>
                  <span className="font-mono font-medium text-sm">{r.title}</span>
                </div>
                <span className="text-xs text-gray-600 max-w-md text-right">{r.details}</span>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Lista de cards carregados */}
      {cards.length > 0 && results.length === 0 && (
        <section className="bg-white rounded-lg shadow p-6">
          <h2 className="text-lg font-semibold mb-3">Cards na {phaseName}</h2>
          <div className="space-y-2">
            {cards.map((c) => (
              <div key={c.id} className={`flex items-center justify-between px-4 py-3 rounded-md border ${c.skip ? "bg-yellow-50 border-yellow-200 opacity-60" : "bg-gray-50 border-gray-200"}`}>
                <div className="flex items-center gap-3">
                  <span className="text-lg">{c.skip ? "⏭️" : "📋"}</span>
                  <div>
                    <span className="font-mono font-medium text-sm">{c.title}</span>
                    {c.labels.length > 0 && (
                      <div className="flex gap-1 mt-1">
                        {c.labels.map((l) => (
                          <span key={l} className="text-[10px] bg-gray-200 px-1.5 py-0.5 rounded">{l}</span>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-xs text-gray-500">{c.assignees.join(", ") || "Sem responsável"}</div>
                  {c.skip && <div className="text-xs text-yellow-600 mt-0.5">{c.skipReason || "Ignorado"}</div>}
                </div>
              </div>
            ))}
          </div>
        </section>
      )}
    </>
  );
}

// =====================
// MAIN APP
// =====================

export default function Home() {
  const [authenticated, setAuthenticated] = useState<boolean | null>(null);
  const [activeTab, setActiveTab] = useState<"processamento" | "fase3" | "fase4">("processamento");

  // Verificar auth ao carregar
  useEffect(() => {
    fetch("/api/auth")
      .then((res) => res.json())
      .then((data) => setAuthenticated(data.authenticated))
      .catch(() => setAuthenticated(false));
  }, []);

  const handleLogout = async () => {
    await fetch("/api/auth", { method: "DELETE" });
    setAuthenticated(false);
  };

  // Loading
  if (authenticated === null) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <p className="text-gray-500">Carregando...</p>
      </div>
    );
  }

  // Login
  if (!authenticated) {
    return <LoginScreen onLogin={() => setAuthenticated(true)} />;
  }

  // Dashboard
  return (
    <div className="max-w-4xl mx-auto p-6">
      <header className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Pipefy Enxoval</h1>
          <p className="text-gray-500 mt-1">Automação de registro de enxoval — Seazone</p>
        </div>
        <button onClick={handleLogout} className="text-sm text-gray-500 hover:text-gray-700 transition-colors">
          Sair
        </button>
      </header>

      {/* Tabs */}
      <div className="flex gap-1 mb-6 bg-gray-100 p-1 rounded-lg">
        <button
          onClick={() => setActiveTab("processamento")}
          className={`flex-1 py-2.5 px-4 rounded-md text-sm font-medium transition-colors ${
            activeTab === "processamento" ? "bg-white text-gray-900 shadow-sm" : "text-gray-500 hover:text-gray-700"
          }`}
        >
          Processamento
        </button>
        <button
          onClick={() => setActiveTab("fase3")}
          className={`flex-1 py-2.5 px-4 rounded-md text-sm font-medium transition-colors ${
            activeTab === "fase3" ? "bg-white text-gray-900 shadow-sm" : "text-gray-500 hover:text-gray-700"
          }`}
        >
          Fase 3
        </button>
        <button
          onClick={() => setActiveTab("fase4")}
          className={`flex-1 py-2.5 px-4 rounded-md text-sm font-medium transition-colors ${
            activeTab === "fase4" ? "bg-white text-gray-900 shadow-sm" : "text-gray-500 hover:text-gray-700"
          }`}
        >
          Fase 4
        </button>
      </div>

      {/* Tab content */}
      {activeTab === "processamento" && <TabProcessamento />}
      {activeTab === "fase3" && <TabUpdateCards apiRoute="/api/update-cards" phaseName="Fase 3" phaseDescription="Atualiza vencimento para o próximo dia útil às 22:00, responsável para Weslley Bertoldo, e replica o último comentário com a nova data. Cards com tags &quot;Adequação Complexa&quot; ou &quot;Revisão de Pendências Finalizada&quot; são ignorados." />}
      {activeTab === "fase4" && <TabUpdateCards apiRoute="/api/update-cards-phase4" phaseName="Fase 4" phaseDescription="Atualiza vencimento para daqui a 2 dias úteis às 22:00 e replica o último comentário com a nova data. Só atualiza cards com vencimento para hoje." />}
    </div>
  );
}
