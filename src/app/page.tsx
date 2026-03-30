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
// TAB: PROCESSAMENTO (cards da Fase 5 com registro de enxoval)
// =====================

interface EnxovalCard {
  id: string;
  title: string;
  hasRecord: boolean;
  recordId: string;
}

function TabProcessamento() {
  const [cards, setCards] = useState<EnxovalCard[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [processingCard, setProcessingCard] = useState<string | null>(null);
  const [processingAll, setProcessingAll] = useState(false);
  const abortRef = useRef(false);
  const [cardStatuses, setCardStatuses] = useState<Record<string, { status: "success" | "error"; message: string }>>({});
  const [summary, setSummary] = useState<{ total: number; withRecord: number; withoutRecord: number } | null>(null);

  const loadCards = async () => {
    setLoading(true);
    setError("");
    setCardStatuses({});
    try {
      const res = await fetch("/api/list-phase5-enxoval");
      const data = await res.json();
      if (data.success) {
        setCards(data.cards);
        setSummary({ total: data.totalCards, withRecord: data.withRecord, withoutRecord: data.withoutRecord });
      } else {
        setError(data.error || "Erro ao carregar cards");
      }
    } catch {
      setError("Erro de conexão");
    } finally {
      setLoading(false);
    }
  };

  const processCard = async (code: string) => {
    setProcessingCard(code);
    try {
      const res = await fetch("/api/process-card", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code }),
      });
      const data = await res.json();
      if (data.success) {
        setCardStatuses((prev) => ({ ...prev, [code]: { status: "success", message: `Registro #${data.recordId} criado` } }));
        // Atualizar card na lista
        setCards((prev) => prev.map((c) => c.title === code ? { ...c, hasRecord: true, recordId: data.recordId } : c));
      } else {
        setCardStatuses((prev) => ({ ...prev, [code]: { status: "error", message: data.error || "Erro" } }));
      }
    } catch {
      setCardStatuses((prev) => ({ ...prev, [code]: { status: "error", message: "Erro de conexão" } }));
    } finally {
      setProcessingCard(null);
    }
  };

  const processAllCards = async () => {
    const toProcess = cards.filter((c) => !c.hasRecord && !cardStatuses[c.title]);
    if (toProcess.length === 0) return;
    abortRef.current = false;
    setProcessingAll(true);
    for (const card of toProcess) {
      if (abortRef.current) break;
      await processCard(card.title);
    }
    setProcessingAll(false);
  };

  const withoutRecord = cards.filter((c) => !c.hasRecord && !cardStatuses[c.title]).length;

  return (
    <>
      <section className="bg-white rounded-lg shadow p-6 mb-6">
        <h2 className="text-lg font-semibold mb-2">Registro de Enxoval — Fase 5</h2>
        <p className="text-sm text-gray-500 mb-4">
          Lista os cards da Fase 5 mostrando quais já possuem registro de enxoval. Clique em &quot;Gerar Registro&quot; para processar individualmente ou &quot;Gerar Todos&quot; para processar todos sem registro.
        </p>
        <div className="flex gap-3">
          <button
            onClick={loadCards}
            disabled={loading || processingAll}
            className="bg-gray-600 text-white px-6 py-3 rounded-md font-medium hover:bg-gray-700 disabled:opacity-50 transition-colors"
          >
            {loading ? "Carregando..." : `Carregar Cards${cards.length > 0 ? ` (${cards.length})` : ""}`}
          </button>
          {cards.length > 0 && withoutRecord > 0 && (
            <button
              onClick={processAllCards}
              disabled={processingAll || processingCard !== null || loading}
              className="bg-blue-600 text-white px-6 py-3 rounded-md font-medium hover:bg-blue-700 disabled:opacity-50 transition-colors"
            >
              {processingAll ? "Gerando..." : `Gerar Todos (${withoutRecord})`}
            </button>
          )}
          {processingAll && (
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
      {summary && (
        <section className="bg-white rounded-lg shadow p-6 mb-6">
          <div className="grid grid-cols-3 gap-4">
            <div className="text-center p-3 bg-gray-50 rounded-lg">
              <div className="text-2xl font-bold text-gray-900">{summary.total}</div>
              <div className="text-xs text-gray-500">Total</div>
            </div>
            <div className="text-center p-3 bg-red-50 rounded-lg">
              <div className="text-2xl font-bold text-red-600">{summary.withoutRecord}</div>
              <div className="text-xs text-gray-500">Sem registro</div>
            </div>
            <div className="text-center p-3 bg-green-50 rounded-lg">
              <div className="text-2xl font-bold text-green-600">{summary.withRecord}</div>
              <div className="text-xs text-gray-500">Com registro</div>
            </div>
          </div>
        </section>
      )}

      {/* Lista de cards */}
      {cards.length > 0 && (
        <section className="space-y-2">
          {cards.map((c) => {
            const cardStatus = cardStatuses[c.title];
            const isProcessing = processingCard === c.title;
            return (
              <div key={c.id} className={`flex items-center justify-between px-4 py-3 rounded-md border ${
                cardStatus?.status === "success" ? "bg-green-50 border-green-200" :
                cardStatus?.status === "error" ? "bg-red-50 border-red-200" :
                c.hasRecord ? "bg-green-50/50 border-green-100" : "bg-white border-gray-200"
              }`}>
                <div className="flex items-center gap-3">
                  <span className="text-lg">
                    {cardStatus?.status === "success" ? "✅" :
                     cardStatus?.status === "error" ? "❌" :
                     isProcessing ? <span className="inline-block animate-spin">⏳</span> :
                     c.hasRecord ? "📋" : "⚠️"}
                  </span>
                  <div>
                    <span className="font-mono font-bold text-sm">{c.title}</span>
                    {c.hasRecord && (
                      <span className="text-xs text-green-600 ml-2">Registro #{c.recordId}</span>
                    )}
                    {!c.hasRecord && !cardStatus && (
                      <span className="text-xs text-red-500 ml-2">Sem registro</span>
                    )}
                    {cardStatus && (
                      <span className={`text-xs ml-2 ${cardStatus.status === "success" ? "text-green-600" : "text-red-600"}`}>
                        {cardStatus.message}
                      </span>
                    )}
                  </div>
                </div>
                <button
                  onClick={() => processCard(c.title)}
                  disabled={isProcessing || processingCard !== null || (c.hasRecord && !cardStatus)}
                  className={`px-4 py-2 rounded-md text-sm font-medium transition-colors whitespace-nowrap ${
                    c.hasRecord && !cardStatus
                      ? "bg-gray-200 text-gray-500 cursor-not-allowed"
                      : "bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50"
                  }`}
                >
                  {isProcessing ? "Processando..." : c.hasRecord && !cardStatus ? "Já registrado" : "Gerar Registro"}
                </button>
              </div>
            );
          })}
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
        <p className="text-sm text-gray-500 mb-4">{phaseDescription}</p>

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
              <div className="text-xs text-gray-500">Ignorados</div>
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
// TAB: FASE 5 (cards individuais com comentário)
// =====================

interface Phase5Card {
  id: string;
  title: string;
  due_date: string | null;
  dueFormatted: string;
  assignees: string[];
  labels: string[];
  lastComment: string;
  lastCommentAuthor: string;
  lastCommentDate: string;
}

function TabPhase5() {
  const [cards, setCards] = useState<Phase5Card[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [updatingCard, setUpdatingCard] = useState<string | null>(null);
  const [cardStatuses, setCardStatuses] = useState<Record<string, { status: "updated" | "error"; message: string }>>({});

  const loadCards = async () => {
    setLoading(true);
    setError("");
    setCardStatuses({});
    try {
      const res = await fetch("/api/update-cards-phase5");
      const data = await res.json();
      if (data.success) {
        setCards(data.cards);
      } else {
        setError(data.error || "Erro ao carregar cards");
      }
    } catch {
      setError("Erro de conexão");
    } finally {
      setLoading(false);
    }
  };

  const updateSingleCard = async (cardId: string) => {
    setUpdatingCard(cardId);
    try {
      const res = await fetch("/api/update-cards-phase5", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cardId }),
      });
      const data = await res.json();
      if (data.success && data.action === "updated") {
        setCardStatuses((prev) => ({ ...prev, [cardId]: { status: "updated", message: data.details } }));
      } else {
        setCardStatuses((prev) => ({ ...prev, [cardId]: { status: "error", message: data.error || data.details || "Erro" } }));
      }
    } catch {
      setCardStatuses((prev) => ({ ...prev, [cardId]: { status: "error", message: "Erro de conexão" } }));
    } finally {
      setUpdatingCard(null);
    }
  };

  const formatCommentDate = (dateStr: string) => {
    if (!dateStr) return "";
    const d = new Date(dateStr);
    const dd = String(d.getDate()).padStart(2, "0");
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const hh = String(d.getHours()).padStart(2, "0");
    const min = String(d.getMinutes()).padStart(2, "0");
    return `${dd}/${mm} ${hh}:${min}`;
  };

  return (
    <>
      <section className="bg-white rounded-lg shadow p-6 mb-6">
        <h2 className="text-lg font-semibold mb-2">Fase 5 — Imóvel Ativo</h2>
        <p className="text-sm text-gray-500 mb-4">
          Lista todos os cards da Fase 5 com o último comentário. Clique no botão para atualizar individualmente: vencimento +3 dias úteis às 22:00 e comentário com nova data.
        </p>
        <button
          onClick={loadCards}
          disabled={loading}
          className="bg-gray-600 text-white px-6 py-3 rounded-md font-medium hover:bg-gray-700 disabled:opacity-50 transition-colors"
        >
          {loading ? "Carregando..." : `Carregar Cards${cards.length > 0 ? ` (${cards.length})` : ""}`}
        </button>
        {error && <p className="text-red-600 text-sm mt-3">{error}</p>}
      </section>

      {cards.length > 0 && (
        <section className="space-y-3">
          {cards.map((c) => {
            const cardStatus = cardStatuses[c.id];
            const isUpdating = updatingCard === c.id;
            return (
              <div key={c.id} className={`bg-white rounded-lg shadow p-5 border-l-4 ${cardStatus?.status === "updated" ? "border-l-green-500" : cardStatus?.status === "error" ? "border-l-red-500" : "border-l-blue-500"}`}>
                {/* Header */}
                <div className="flex items-center justify-between mb-3">
                  <div>
                    <span className="font-mono font-bold text-base">{c.title}</span>
                    <span className="text-xs text-gray-500 ml-3">Vencimento: {c.dueFormatted}</span>
                    {c.assignees.length > 0 && (
                      <span className="text-xs text-gray-400 ml-3">{c.assignees.join(", ")}</span>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    {cardStatus?.status === "updated" && <span className="text-green-600 text-xs">{cardStatus.message}</span>}
                    {cardStatus?.status === "error" && <span className="text-red-600 text-xs">{cardStatus.message}</span>}
                    <button
                      onClick={() => updateSingleCard(c.id)}
                      disabled={isUpdating || updatingCard !== null}
                      className="bg-blue-600 text-white px-4 py-2 rounded-md text-sm font-medium hover:bg-blue-700 disabled:opacity-50 transition-colors whitespace-nowrap"
                    >
                      {isUpdating ? "Atualizando..." : "+3 dias"}
                    </button>
                  </div>
                </div>

                {/* Labels */}
                {c.labels.length > 0 && (
                  <div className="flex gap-1 mb-3">
                    {c.labels.map((l) => (
                      <span key={l} className="text-[10px] bg-gray-200 px-1.5 py-0.5 rounded">{l}</span>
                    ))}
                  </div>
                )}

                {/* Último comentário */}
                {c.lastComment ? (
                  <div className="bg-gray-50 rounded-md p-3 border border-gray-200">
                    <div className="flex items-center gap-2 mb-2">
                      <span className="text-xs font-medium text-gray-700">{c.lastCommentAuthor}</span>
                      <span className="text-[10px] text-gray-400">{formatCommentDate(c.lastCommentDate)}</span>
                    </div>
                    <pre className="text-xs text-gray-600 whitespace-pre-wrap font-sans leading-relaxed">{c.lastComment}</pre>
                  </div>
                ) : (
                  <p className="text-xs text-gray-400">Sem comentários</p>
                )}
              </div>
            );
          })}
        </section>
      )}
    </>
  );
}

// =====================
// TAB: REVISÃO (Complexa + Revisão de Pendências)
// =====================

interface RevisaoCard {
  id: string;
  title: string;
  type: "complexa" | "revisao" | "none";
  due_date: string | null;
  dueFormatted: string;
  assignees: string[];
  labels: string[];
  lastComment: string;
  lastCommentAuthor: string;
  lastCommentDate: string;
}

function getDefaultRevisaoComment(fupDate: string): string {
  return `🟡 Imóvel em ativação

🚨 Aguardando ativação do imóvel

⏭️ Fup: ${fupDate}

...................................................................................................

❌ ENXOVAL

✔️ ITENS MÍNIMOS

✔️ MANUTENÇÃO

✔️ INTERNET

✔️PIN`;
}

function TabRevisao() {
  const [cards, setCards] = useState<RevisaoCard[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [updatingCard, setUpdatingCard] = useState<string | null>(null);
  const [cardStatuses, setCardStatuses] = useState<Record<string, { status: "updated" | "error"; message: string }>>({});
  const [editingComment, setEditingComment] = useState<string | null>(null);
  const [commentText, setCommentText] = useState("");
  const [summary, setSummary] = useState<{ complexaCount: number; revisaoCount: number } | null>(null);

  const loadCards = async () => {
    setLoading(true);
    setError("");
    setCardStatuses({});
    setEditingComment(null);
    try {
      const res = await fetch("/api/update-cards-revisao");
      const data = await res.json();
      if (data.success) {
        setCards(data.cards.filter((c: RevisaoCard) => c.type !== "none"));
        setSummary({ complexaCount: data.complexaCount, revisaoCount: data.revisaoCount });
      } else {
        setError(data.error || "Erro ao carregar");
      }
    } catch {
      setError("Erro de conexão");
    } finally {
      setLoading(false);
    }
  };

  const updateComplexa = async (cardId: string) => {
    setUpdatingCard(cardId);
    try {
      const res = await fetch("/api/update-cards-revisao", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cardId, type: "complexa" }),
      });
      const data = await res.json();
      if (data.success) {
        setCardStatuses((prev) => ({ ...prev, [cardId]: { status: "updated", message: data.details } }));
      } else {
        setCardStatuses((prev) => ({ ...prev, [cardId]: { status: "error", message: data.error || "Erro" } }));
      }
    } catch {
      setCardStatuses((prev) => ({ ...prev, [cardId]: { status: "error", message: "Erro de conexão" } }));
    } finally {
      setUpdatingCard(null);
    }
  };

  const openRevisaoEditor = (cardId: string) => {
    // Calcular FUP +2 dias úteis
    const now = new Date();
    let added = 0;
    const next = new Date(now);
    while (added < 2) {
      next.setDate(next.getDate() + 1);
      if (next.getDay() !== 0 && next.getDay() !== 6) added++;
    }
    const dd = String(next.getDate()).padStart(2, "0");
    const mm = String(next.getMonth() + 1).padStart(2, "0");
    const fupDate = `${dd}/${mm}`;

    setEditingComment(cardId);
    setCommentText(getDefaultRevisaoComment(fupDate));
  };

  const sendRevisaoComment = async () => {
    if (!editingComment || !commentText.trim()) return;
    setUpdatingCard(editingComment);
    try {
      const res = await fetch("/api/update-cards-revisao", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cardId: editingComment, type: "revisao", customComment: commentText }),
      });
      const data = await res.json();
      if (data.success) {
        setCardStatuses((prev) => ({ ...prev, [editingComment!]: { status: "updated", message: data.details } }));
      } else {
        setCardStatuses((prev) => ({ ...prev, [editingComment!]: { status: "error", message: data.error || "Erro" } }));
      }
    } catch {
      setCardStatuses((prev) => ({ ...prev, [editingComment!]: { status: "error", message: "Erro de conexão" } }));
    } finally {
      setUpdatingCard(null);
      setEditingComment(null);
    }
  };

  const formatCommentDate = (dateStr: string) => {
    if (!dateStr) return "";
    const d = new Date(dateStr);
    return d.toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
  };

  const complexaCards = cards.filter((c) => c.type === "complexa");
  const revisaoCards = cards.filter((c) => c.type === "revisao");

  return (
    <>
      <section className="bg-white rounded-lg shadow p-6 mb-6">
        <h2 className="text-lg font-semibold mb-2">Revisão — Fase 3</h2>
        <p className="text-sm text-gray-500 mb-4">
          Cards com tag &quot;Adequação Complexa&quot; e cards com tag &quot;Revisão de Pendências Finalizada&quot; (sem complexa).
        </p>
        <button onClick={loadCards} disabled={loading} className="bg-gray-600 text-white px-6 py-3 rounded-md font-medium hover:bg-gray-700 disabled:opacity-50 transition-colors">
          {loading ? "Carregando..." : "Carregar Cards"}
        </button>
        {error && <p className="text-red-600 text-sm mt-3">{error}</p>}
      </section>

      {summary && (
        <section className="bg-white rounded-lg shadow p-6 mb-6">
          <div className="grid grid-cols-2 gap-4">
            <div className="text-center p-3 bg-orange-50 rounded-lg">
              <div className="text-2xl font-bold text-orange-600">{summary.complexaCount}</div>
              <div className="text-xs text-gray-500">Adequação Complexa</div>
            </div>
            <div className="text-center p-3 bg-purple-50 rounded-lg">
              <div className="text-2xl font-bold text-purple-600">{summary.revisaoCount}</div>
              <div className="text-xs text-gray-500">Revisão Finalizada</div>
            </div>
          </div>
        </section>
      )}

      {/* COMPLEXA */}
      {complexaCards.length > 0 && (
        <section className="mb-8">
          <h3 className="text-lg font-bold text-orange-700 mb-3 px-1">COMPLEXA</h3>
          <div className="space-y-3">
            {complexaCards.map((c) => {
              const cardStatus = cardStatuses[c.id];
              const isUpdating = updatingCard === c.id;
              return (
                <div key={c.id} className={`bg-white rounded-lg shadow p-5 border-l-4 ${cardStatus?.status === "updated" ? "border-l-green-500" : cardStatus?.status === "error" ? "border-l-red-500" : "border-l-orange-500"}`}>
                  <div className="flex items-center justify-between mb-3">
                    <div>
                      <span className="font-mono font-bold text-base">{c.title}</span>
                      <span className="text-xs text-gray-500 ml-3">Vencimento: {c.dueFormatted}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      {cardStatus && <span className={`text-xs ${cardStatus.status === "updated" ? "text-green-600" : "text-red-600"}`}>{cardStatus.message}</span>}
                      <button onClick={() => updateComplexa(c.id)} disabled={isUpdating || updatingCard !== null} className="bg-orange-600 text-white px-4 py-2 rounded-md text-sm font-medium hover:bg-orange-700 disabled:opacity-50 transition-colors whitespace-nowrap">
                        {isUpdating ? "Atualizando..." : "+1 dia"}
                      </button>
                    </div>
                  </div>
                  {c.lastComment && (
                    <div className="bg-gray-50 rounded-md p-3 border border-gray-200">
                      <div className="flex items-center gap-2 mb-2">
                        <span className="text-xs font-medium text-gray-700">{c.lastCommentAuthor}</span>
                        <span className="text-[10px] text-gray-400">{formatCommentDate(c.lastCommentDate)}</span>
                      </div>
                      <pre className="text-xs text-gray-600 whitespace-pre-wrap font-sans leading-relaxed">{c.lastComment}</pre>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* REVISÃO DE PENDÊNCIAS FINALIZADA */}
      {revisaoCards.length > 0 && (
        <section className="mb-8">
          <h3 className="text-lg font-bold text-purple-700 mb-3 px-1">REVISÃO DE PENDÊNCIAS FINALIZADA</h3>
          <div className="space-y-3">
            {revisaoCards.map((c) => {
              const cardStatus = cardStatuses[c.id];
              const isUpdating = updatingCard === c.id;
              const isEditing = editingComment === c.id;
              return (
                <div key={c.id} className={`bg-white rounded-lg shadow p-5 border-l-4 ${cardStatus?.status === "updated" ? "border-l-green-500" : cardStatus?.status === "error" ? "border-l-red-500" : "border-l-purple-500"}`}>
                  <div className="flex items-center justify-between mb-3">
                    <div>
                      <span className="font-mono font-bold text-base">{c.title}</span>
                      <span className="text-xs text-gray-500 ml-3">Vencimento: {c.dueFormatted}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      {cardStatus && <span className={`text-xs ${cardStatus.status === "updated" ? "text-green-600" : "text-red-600"}`}>{cardStatus.message}</span>}
                      {!isEditing && !cardStatus && (
                        <button onClick={() => openRevisaoEditor(c.id)} disabled={updatingCard !== null} className="bg-purple-600 text-white px-4 py-2 rounded-md text-sm font-medium hover:bg-purple-700 disabled:opacity-50 transition-colors whitespace-nowrap">
                          Atualizar comentário
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Editor de comentário */}
                  {isEditing && (
                    <div className="bg-purple-50 rounded-md p-4 border border-purple-200 mb-3">
                      <p className="text-xs font-medium text-purple-700 mb-2">Edite o comentário antes de enviar:</p>
                      <textarea
                        value={commentText}
                        onChange={(e) => setCommentText(e.target.value)}
                        rows={15}
                        className="w-full border border-purple-300 rounded-md px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-purple-500"
                      />
                      <div className="flex gap-2 mt-3">
                        <button onClick={sendRevisaoComment} disabled={isUpdating} className="bg-purple-600 text-white px-4 py-2 rounded-md text-sm font-medium hover:bg-purple-700 disabled:opacity-50 transition-colors">
                          {isUpdating ? "Enviando..." : "Enviar comentário"}
                        </button>
                        <button onClick={() => setEditingComment(null)} className="bg-gray-200 text-gray-700 px-4 py-2 rounded-md text-sm font-medium hover:bg-gray-300 transition-colors">
                          Cancelar
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Último comentário */}
                  {c.lastComment && !isEditing && (
                    <div className="bg-gray-50 rounded-md p-3 border border-gray-200">
                      <div className="flex items-center gap-2 mb-2">
                        <span className="text-xs font-medium text-gray-700">{c.lastCommentAuthor}</span>
                        <span className="text-[10px] text-gray-400">{formatCommentDate(c.lastCommentDate)}</span>
                      </div>
                      <pre className="text-xs text-gray-600 whitespace-pre-wrap font-sans leading-relaxed">{c.lastComment}</pre>
                    </div>
                  )}
                </div>
              );
            })}
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
  const [activeTab, setActiveTab] = useState<"processamento" | "fase3" | "fase4" | "fase5" | "revisao">("processamento");

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
        <button
          onClick={() => setActiveTab("fase5")}
          className={`flex-1 py-2.5 px-4 rounded-md text-sm font-medium transition-colors ${
            activeTab === "fase5" ? "bg-white text-gray-900 shadow-sm" : "text-gray-500 hover:text-gray-700"
          }`}
        >
          Fase 5
        </button>
        <button
          onClick={() => setActiveTab("revisao")}
          className={`flex-1 py-2.5 px-4 rounded-md text-sm font-medium transition-colors ${
            activeTab === "revisao" ? "bg-white text-gray-900 shadow-sm" : "text-gray-500 hover:text-gray-700"
          }`}
        >
          Revisão
        </button>
      </div>

      {/* Tab content */}
      {activeTab === "processamento" && <TabProcessamento />}
      {activeTab === "fase3" && <TabUpdateCards apiRoute="/api/update-cards" phaseName="Fase 3" phaseDescription={'Atualiza vencimento para o próximo dia útil às 22:00, responsável para Weslley Bertoldo, e replica o último comentário com a nova data. Cards com tags "Adequação Complexa" ou "Revisão de Pendências Finalizada" são ignorados.'} />}
      {activeTab === "fase4" && <TabUpdateCards apiRoute="/api/update-cards-phase4" phaseName="Fase 4" phaseDescription="Atualiza vencimento para daqui a 2 dias úteis às 22:00 e replica o último comentário com a nova data. Só atualiza cards do Weslley com vencimento para hoje." />}
      {activeTab === "fase5" && <TabPhase5 />}
      {activeTab === "revisao" && <TabRevisao />}
    </div>
  );
}
