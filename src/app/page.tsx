"use client";

import { useState, useCallback, useRef, useEffect } from "react";

// =====================
// COMPONENTE: Select com pesquisa
// =====================

function SearchableSelect({ label, value, onChange, options, placeholder }: {
  label: string; value: string; onChange: (v: string) => void; options: string[]; placeholder?: string;
}) {
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const filtered = search
    ? options.filter((o) => o.toLowerCase().includes(search.toLowerCase()))
    : options;

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  return (
    <div ref={ref} className="relative">
      <label className="text-sm font-medium text-gray-700 block mb-1">{label}</label>
      <input
        type="text"
        value={open ? search : value || search}
        onChange={(e) => { setSearch(e.target.value); setOpen(true); if (!e.target.value) onChange(""); }}
        onFocus={() => setOpen(true)}
        placeholder={placeholder || "Selecione..."}
        className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
      />
      {value && !open && (
        <button onClick={() => { onChange(""); setSearch(""); setOpen(true); }} className="absolute right-2 top-8 text-gray-400 hover:text-gray-600 text-xs">
          limpar
        </button>
      )}
      {open && filtered.length > 0 && (
        <div className="absolute z-10 w-full mt-1 bg-white border border-gray-300 rounded-md shadow-lg max-h-48 overflow-y-auto">
          {filtered.map((o) => (
            <button
              key={o}
              onClick={() => { onChange(o); setSearch(""); setOpen(false); }}
              className={`w-full text-left px-3 py-2 text-sm hover:bg-blue-50 ${value === o ? "bg-blue-100 font-medium" : ""}`}
            >
              {o}
            </button>
          ))}
        </div>
      )}
      {open && filtered.length === 0 && search && (
        <div className="absolute z-10 w-full mt-1 bg-white border border-gray-300 rounded-md shadow-lg p-3 text-sm text-gray-500">
          Nenhum resultado
        </div>
      )}
    </div>
  );
}

// =====================
// COMPONENTE: Código copiável
// =====================

function CopyableCode({ code, className = "text-sm" }: { code: string; className?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <span
      className={`font-mono font-bold ${className} cursor-pointer relative group`}
      onClick={() => {
        navigator.clipboard.writeText(code);
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      }}
      title="Clique para copiar"
    >
      {code}
      <span className={`ml-1.5 text-[10px] font-normal transition-opacity ${copied ? "text-green-600 opacity-100" : "text-gray-400 opacity-0 group-hover:opacity-100"}`}>
        {copied ? "copiado!" : "copiar"}
      </span>
    </span>
  );
}

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
                    <CopyableCode code={c.title} className="text-sm" />
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

const COPY_TEMPLATES: Record<string, (fup: string) => string> = {
  fase4: (fup) => `🟡 Imóvel em ativação\n\n🚨 Aguardando ativação do imóvel\n\n⏭️ Fup: ${fup}\n\n...................................................................................................`,
  fase5: (fup) => `✅ Imóvel ativo\n\n🚨 Aguardando o envio dos registros pendentes\n\n⏭️ Fup: ${fup}\n\n....................................................................................................`,
};

function CopyFupButton({ days, template = "fase4" }: { days: number; template?: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    const now = new Date();
    let added = 0;
    const next = new Date(now);
    while (added < days) {
      next.setDate(next.getDate() + 1);
      if (next.getDay() !== 0 && next.getDay() !== 6) added++;
    }
    const dd = String(next.getDate()).padStart(2, "0");
    const mm = String(next.getMonth() + 1).padStart(2, "0");

    const textFn = COPY_TEMPLATES[template] || COPY_TEMPLATES.fase4;
    const text = textFn(`${dd}/${mm}`);

    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  return (
    <button
      onClick={handleCopy}
      className={`px-6 py-3 rounded-md font-medium transition-colors ${copied ? "bg-green-600 text-white" : "bg-yellow-500 text-white hover:bg-yellow-600"}`}
    >
      {copied ? "Copiado!" : "Copiar FUP"}
    </button>
  );
}

function TabUpdateCards({ apiRoute, phaseName, phaseDescription, showCopyButton }: { apiRoute: string; phaseName: string; phaseDescription: string; showCopyButton?: boolean }) {
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

          {showCopyButton && <CopyFupButton days={2} />}
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
                  <CopyableCode code={r.title} className="text-sm" />
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
                    <CopyableCode code={c.title} className="text-sm" />
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
      <SlackDespesa />

      <section className="bg-white rounded-lg shadow p-6 mb-6">
        <h2 className="text-lg font-semibold mb-2">Fase 5 — Imóvel Ativo</h2>
        <p className="text-sm text-gray-500 mb-4">
          Lista todos os cards da Fase 5 com o último comentário. Clique no botão para atualizar individualmente: vencimento +3 dias úteis às 22:00 e comentário com nova data.
        </p>
        <div className="flex gap-3">
          <button
            onClick={loadCards}
            disabled={loading}
            className="bg-gray-600 text-white px-6 py-3 rounded-md font-medium hover:bg-gray-700 disabled:opacity-50 transition-colors"
          >
            {loading ? "Carregando..." : `Carregar Cards${cards.length > 0 ? ` (${cards.length})` : ""}`}
          </button>
          <CopyFupButton days={3} template="fase5" />
        </div>
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
                    <CopyableCode code={c.title} className="text-base" />
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
// COMPONENTE: Lançamento de Despesa no Slack
// =====================

function SlackDespesa() {
  const [code, setCode] = useState("");
  const [franquia, setFranquia] = useState("");
  const [data, setData] = useState("");
  const [loadingFranquia, setLoadingFranquia] = useState(false);
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState<{ success: boolean; message: string } | null>(null);

  // Buscar franquia ao digitar código
  useEffect(() => {
    if (code.trim().length >= 3) {
      const timer = setTimeout(async () => {
        setLoadingFranquia(true);
        try {
          const res = await fetch(`/api/get-franqueado?code=${encodeURIComponent(code.trim())}`);
          const d = await res.json();
          if (d.franqueado) setFranquia(d.franqueado);
        } catch { /* silencioso */ }
        finally { setLoadingFranquia(false); }
      }, 500);
      return () => clearTimeout(timer);
    }
  }, [code]);

  const handleEnviar = async () => {
    setSending(true);
    setResult(null);
    try {
      const res = await fetch("/api/slack-despesa", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ codigo: code.trim(), franquia, data }),
      });
      const d = await res.json();
      if (d.success) {
        setResult({ success: true, message: d.message });
        setCode("");
        setFranquia("");
        setData("");
      } else {
        setResult({ success: false, message: d.error || "Erro" });
      }
    } catch {
      setResult({ success: false, message: "Erro de conexão" });
    } finally {
      setSending(false);
    }
  };

  return (
    <section className="bg-white rounded-lg shadow p-6 mt-6">
      <h3 className="text-lg font-semibold mb-1">Aviso de Lançamento de Despesa</h3>
      <p className="text-xs text-gray-500 mb-4">Envia mensagem no canal #despesas-implantação do Slack.</p>

      <div className="grid grid-cols-3 gap-3">
        <div>
          <label className="text-xs text-gray-500 block mb-1">Código do imóvel</label>
          <input type="text" value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} placeholder="Ex: AGU0000" className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500" />
        </div>
        <div>
          <label className="text-xs text-gray-500 block mb-1">Franquia {loadingFranquia && "(buscando...)"}</label>
          <input type="text" value={franquia} onChange={(e) => setFranquia(e.target.value)} placeholder="Preenchido automaticamente" className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500" />
        </div>
        <div>
          <label className="text-xs text-gray-500 block mb-1">Data lançamento</label>
          <input type="date" value={data} onChange={(e) => setData(e.target.value)} className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500" />
        </div>
      </div>

      <div className="flex items-center gap-3 mt-4">
        <button onClick={handleEnviar} disabled={sending || !code.trim() || !franquia || !data} className="bg-green-600 text-white px-6 py-2.5 rounded-md text-sm font-medium hover:bg-green-700 disabled:opacity-50 transition-colors">
          {sending ? "Enviando..." : "Enviar no Slack"}
        </button>
        {result && <span className={`text-xs ${result.success ? "text-green-600" : "text-red-600"}`}>{result.message}</span>}
      </div>
    </section>
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
                      <CopyableCode code={c.title} className="text-base" />
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
                      <CopyableCode code={c.title} className="text-base" />
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
// TAB: COMPLEXA (todos os cards com tag Adequação Complexa)
// =====================

interface ComplexaCard {
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

function TabComplexa() {
  const [cards, setCards] = useState<ComplexaCard[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const loadCards = async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/list-complexa");
      const data = await res.json();
      if (data.success) {
        setCards(data.cards);
      } else {
        setError(data.error || "Erro ao carregar");
      }
    } catch {
      setError("Erro de conexão");
    } finally {
      setLoading(false);
    }
  };

  const formatCommentDate = (dateStr: string) => {
    if (!dateStr) return "";
    const d = new Date(dateStr);
    return d.toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
  };

  return (
    <>
      <section className="bg-white rounded-lg shadow p-6 mb-6">
        <h2 className="text-lg font-semibold mb-2">Adequação Complexa — Fase 3</h2>
        <p className="text-sm text-gray-500 mb-4">
          Todos os cards da Fase 3 com tag &quot;Adequação Complexa&quot; e o último comentário.
        </p>
        <button onClick={loadCards} disabled={loading} className="bg-gray-600 text-white px-6 py-3 rounded-md font-medium hover:bg-gray-700 disabled:opacity-50 transition-colors">
          {loading ? "Carregando..." : `Carregar Cards${cards.length > 0 ? ` (${cards.length})` : ""}`}
        </button>
        {error && <p className="text-red-600 text-sm mt-3">{error}</p>}
      </section>

      {cards.length > 0 && (
        <section className="space-y-3">
          {cards.map((c) => (
            <div key={c.id} className="bg-white rounded-lg shadow p-5 border-l-4 border-l-orange-500">
              <div className="flex items-center justify-between mb-3">
                <div>
                  <CopyableCode code={c.title} className="text-base" />
                  <span className="text-xs text-gray-500 ml-3">Vencimento: {c.dueFormatted}</span>
                  {c.assignees.length > 0 && <span className="text-xs text-gray-400 ml-3">{c.assignees.join(", ")}</span>}
                </div>
              </div>
              {c.labels.length > 0 && (
                <div className="flex gap-1 mb-3">
                  {c.labels.map((l) => (
                    <span key={l} className="text-[10px] bg-gray-200 px-1.5 py-0.5 rounded">{l}</span>
                  ))}
                </div>
              )}
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
          ))}
        </section>
      )}
    </>
  );
}

// =====================
// TAB: OCORRÊNCIA / SUPORTES
// =====================

const CATEGORIAS_SUPORTE = [
  "Falta de retorno do franqueado (hóspede, time interno)",
  "Alinhamento com a franquia de uma despesa lançada",
  "Análise de comentários - Dúvidas/Alinhamento com a franquia",
  "Análise de taxa de limpeza",
  "Apoio jurídico/Chargebacks",
  "Busca de fornecedores",
  "Dados franqueado - Solicitar/Alterar dados",
  "Definição de franquia",
  "Dúvidas sobre anúncios",
  "Franquia recusando a executar processos (vistoria, checkin)",
  "Informações referentes a danos",
  "Lançamento de dano Easycover",
  "Questões financeiras da franquia",
  "Reclamação do proprietário sobre o trabalho da franquia",
  "Solicitação de compra de itens/manutenção",
  "Solicitar migração de imóvel",
  "Validação/aprovação/cancelamento de despesas",
  "Validar se uma manutenção já foi feita",
  "Vistoria de migração",
  "Acompanhamento de uma manutenção",
  "Devolução de enxoval (churn/migração)",
  "Problemas operacionais com enxoval",
  "Acessos ao imóvel",
  "Bloqueios de calendário",
];

const SETORES_SUPORTE = [
  "Implantação",
  "Anúncios",
  "Atendimento",
  "B2B",
  "Comercial",
  "CS e Suporte Proprietários",
  "Financeiro e Fechamento",
  "Fornecedores",
  "Franquias",
  "Grandes Operações",
  "Jurídico",
  "Melhoria Contínua",
  "Precificação",
];

const ORIGENS_OCORRENCIA = [
  "Atendimento ao Hóspede",
  "Implantação",
  "Caça Ocorrências",
  "Comentários",
  "Suporte Franquias",
  "Gestor Regional",
  "Danos",
  "Despesas",
  "Manutenções",
  "Outros",
  "Treinamento",
  "Cancelamento de vistorias",
];

function CopyTemplateButton({ label, placeholder, buildText }: { label: string; placeholder: string; buildText: (val: string) => string }) {
  const [val, setVal] = useState("");
  const [copied, setCopied] = useState(false);

  const texto = val ? buildText(val) : "";

  const handleCopy = () => {
    if (!texto) return;
    navigator.clipboard.writeText(texto).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  return (
    <div className="flex items-end gap-2">
      <div className="flex-shrink-0">
        <label className="text-xs text-gray-500 block mb-1">{label}</label>
        <input
          type="text"
          value={val}
          onChange={(e) => setVal(e.target.value)}
          placeholder={placeholder}
          className="w-24 border border-gray-300 rounded-md px-2 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-yellow-500"
        />
      </div>
      <button
        onClick={handleCopy}
        disabled={!val}
        className={`px-4 py-2 rounded-md text-sm font-medium transition-colors whitespace-nowrap ${copied ? "bg-green-600 text-white" : "bg-yellow-500 text-white hover:bg-yellow-600 disabled:opacity-50"}`}
      >
        {copied ? "Copiado!" : "Copiar"}
      </button>
    </div>
  );
}

function CopyDiasTexto() {
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-4">
        <CopyTemplateButton
          label="Dias sem retorno"
          placeholder="Ex: 5"
          buildText={(dias) => `Franquia está a ${dias} dias sem dar retorno, atrasando os processos da implantação.`}
        />
        <CopyTemplateButton
          label="Data prometida"
          placeholder="Ex: 28/03"
          buildText={(data) => `Franquia sinalizou iria enviar os registros pendentes no dia ${data} e não enviou. A falta de retorno da franquia impacta diretamente o tempo de implantação que é um dos KPI importantes para mensurar a produtividade e agilidade da implantação.`}
        />
      </div>
    </div>
  );
}

function TabOcorrenciaSuporte() {
  const [activeForm, setActiveForm] = useState<"suporte" | "ocorrencia" | "anuncio">("suporte");

  return (
    <>
      <section className="bg-white rounded-lg shadow p-6 mb-6">
        <h2 className="text-lg font-semibold mb-4">Ocorrência / Suportes</h2>
        <div className="flex gap-2 mb-4">
          <button
            onClick={() => setActiveForm("suporte")}
            className={`px-5 py-2.5 rounded-md text-sm font-medium transition-colors ${activeForm === "suporte" ? "bg-blue-600 text-white" : "bg-gray-100 text-gray-700 hover:bg-gray-200"}`}
          >
            Suporte Franquias
          </button>
          <button
            onClick={() => setActiveForm("ocorrencia")}
            className={`px-5 py-2.5 rounded-md text-sm font-medium transition-colors ${activeForm === "ocorrencia" ? "bg-blue-600 text-white" : "bg-gray-100 text-gray-700 hover:bg-gray-200"}`}
          >
            Ocorrência
          </button>
          <button
            onClick={() => setActiveForm("anuncio")}
            className={`px-5 py-2.5 rounded-md text-sm font-medium transition-colors ${activeForm === "anuncio" ? "bg-blue-600 text-white" : "bg-gray-100 text-gray-700 hover:bg-gray-200"}`}
          >
            Atualizar Anúncio
          </button>
        </div>
        {activeForm === "ocorrencia" && <CopyDiasTexto />}
      </section>

      {activeForm === "suporte" && <FormSuporte />}
      {activeForm === "ocorrencia" && <FormOcorrencia />}
      {activeForm === "anuncio" && <FormAtualizarAnuncio />}
    </>
  );
}

function FormSuporte() {
  const [codigo, setCodigo] = useState("");
  const [franqueado, setFranqueado] = useState("");
  const [loadingFranqueado, setLoadingFranqueado] = useState(false);
  const [categoria, setCategoria] = useState(CATEGORIAS_SUPORTE[0]);
  const [setor, setSetor] = useState(SETORES_SUPORTE[0]);
  const [descComplemento, setDescComplemento] = useState("");
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState<{ success: boolean; message: string } | null>(null);

  const descBase = "Pessoal, boa tarde. Tudo bem?\nConseguem nos ajudar com o retorno da franquia?";

  const buscarFranqueado = async () => {
    if (!codigo.trim()) return;
    setLoadingFranqueado(true);
    try {
      const res = await fetch(`/api/get-franqueado?code=${encodeURIComponent(codigo.trim())}`);
      const data = await res.json();
      if (data.franqueado) setFranqueado(data.franqueado);
    } catch { /* silencioso */ }
    finally { setLoadingFranqueado(false); }
  };

  useEffect(() => {
    if (codigo.trim().length >= 3) {
      const timer = setTimeout(buscarFranqueado, 500);
      return () => clearTimeout(timer);
    }
  }, [codigo]);

  const descricaoCompleta = descComplemento.trim()
    ? `${descBase}\n${descComplemento.trim()}`
    : descBase;

  const handleEnviar = async () => {
    setSending(true);
    setResult(null);
    try {
      const res = await fetch("/api/create-suporte", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: "weslley.bertoldo@seazone.com.br",
          codigo: codigo.trim(),
          categoria,
          setor,
          descricao: descricaoCompleta,
          franqueado,
        }),
      });
      const data = await res.json();
      if (data.success) {
        setResult({ success: true, message: `Suporte criado! Card #${data.cardId}` });
        setCodigo("");
        setDescComplemento("");
      } else {
        setResult({ success: false, message: data.error || "Erro ao criar" });
      }
    } catch {
      setResult({ success: false, message: "Erro de conexão" });
    } finally {
      setSending(false);
    }
  };

  return (
    <section className="bg-white rounded-lg shadow p-6 mb-6">
      <h3 className="text-lg font-semibold mb-1">Suporte Franquias</h3>
      <p className="text-xs text-gray-500 mb-4">Preencha e clique &quot;Enviar&quot;. O suporte será criado diretamente no Pipefy.</p>

      <div className="space-y-4">
        <div>
          <label className="text-sm font-medium text-gray-700 block mb-1">E-mail solicitante</label>
          <input type="email" value="weslley.bertoldo@seazone.com.br" readOnly className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm bg-gray-50" />
        </div>

        <div>
          <label className="text-sm font-medium text-gray-700 block mb-1">Código do Imóvel</label>
          <input type="text" value={codigo} onChange={(e) => setCodigo(e.target.value.toUpperCase())} placeholder="Ex: ALA0004" className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
        </div>

        <div>
          <label className="text-sm font-medium text-gray-700 block mb-1">Categoria da solicitação</label>
          <select value={categoria} onChange={(e) => setCategoria(e.target.value)} className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm bg-white">
            {CATEGORIAS_SUPORTE.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>

        <div>
          <label className="text-sm font-medium text-gray-700 block mb-1">Setor Solicitante</label>
          <select value={setor} onChange={(e) => setSetor(e.target.value)} className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm bg-white">
            {SETORES_SUPORTE.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>

        <div>
          <label className="text-sm font-medium text-gray-700 block mb-1">Descrição do Problema</label>
          <div className="bg-gray-50 border border-gray-200 rounded-md p-3 mb-2">
            <pre className="text-sm text-gray-700 whitespace-pre-wrap font-sans">{descBase}</pre>
          </div>
          <label className="text-xs text-gray-500 block mb-1">Complemento (link, detalhes, etc.)</label>
          <textarea value={descComplemento} onChange={(e) => setDescComplemento(e.target.value)} placeholder="https://seazone.sults.com.br/chamados/interacoes/..." rows={3} className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
        </div>

        <div>
          <label className="text-sm font-medium text-gray-700 block mb-1">Franqueado</label>
          <input type="text" value={franqueado} onChange={(e) => setFranqueado(e.target.value)} placeholder={loadingFranqueado ? "Buscando..." : "Preenchido automaticamente pelo código"} className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
          <p className="text-[10px] text-gray-400 mt-1">Buscado automaticamente do Pipe 1. Edite se necessário.</p>
        </div>

        <div className="bg-blue-50 rounded-md p-4 border border-blue-200">
          <p className="text-xs font-medium text-blue-700 mb-2">Descrição que será enviada:</p>
          <pre className="text-xs text-blue-900 whitespace-pre-wrap font-sans">{descricaoCompleta}</pre>
        </div>

        {result && (
          <div className={`p-3 rounded-md text-sm ${result.success ? "bg-green-50 text-green-700 border border-green-200" : "bg-red-50 text-red-700 border border-red-200"}`}>
            {result.message}
          </div>
        )}

        <button onClick={handleEnviar} disabled={sending || !codigo.trim()} className="w-full bg-blue-600 text-white py-3 rounded-md font-medium hover:bg-blue-700 disabled:opacity-50 transition-colors">
          {sending ? "Enviando..." : "Enviar Suporte"}
        </button>
      </div>
    </section>
  );
}

const FRANQUIAS_OCORRENCIA = ["Adriana Bozeti","Alan Mesquita Maciel","Ana Carla de Aguiar Lopes","Ana Carolina Assmus Barski","Ana Lúcia Gasparello Cruz","Ana Márcia Pereira Buzzacchino","Ana Paula Friedrich de Oliveira","André Demetrio","Andrea Mara dos Santos podlasinski","Andreia Real da Rosa","CAMILA BRESOLIN PEREIRA","Camila Moura Lacerda","Camila Silva Costa","Carlos Eduardo Inácio Diniz","Caroline Sorondo Vaghetti","Cassiana Outeiro Silva de Souza","Christian Cerqueira de Carvalho","Christina Elisabeth Carpes Antunes","Cingridi Cristina Mariano","Cleverson de O. Redivo","Daniela Lopes Nasario","Débora Renata Gomes Soares","Dhennyfer Rosa de Almeida","Diego Rafael Padilha dos Santos","Dineia Pedroso de Almeida","Dreicom Adolfo Neckel Wolter","DRIELY LOHANNE CONSTANTINO","Edilson Machado da Silva","Edite Alves","Eduardo José Pereira Santos","Erion Xhafaj","Evelyn Gabriela dos Santos","Fábio Moreira Campos Monteiro","Fernanda Kieling Kist","Flávio de Souza Porto","Francisco Diey Brito","Gabriela da Luz Nunes","Giselia Soares da Silva","Gladys Timmerman","Glauciene Sacramento Santos","Gustavo Henrique de Barros Silva","Gustavo Ribas","Isadora Corrêa de Oliveira","Itamar Franco Junior","Izana Serra Lima","Jaciane Melo Graciliano","Jane Terezinha de Souza de Jesus","Jayson Luckemeyer","Jeferson Luis Fernandes","Jênifer Niéli Ribas","Jéssica Schirley Sibilio Dutra Jordão Macedo","Jhenyffer Paola Ramos Da Silva","Jocelia de Lima Caron","John Erik Gasparello","José Fernando de Campos","José Ronaldo Cerqueira de Freitas","Juliana Lemos da Silva","Kathellyne Soares de Moraes","Katia Leite do Nascimento Emmel","Kemille Negromonte de Souza","Letícia Fagundes","Luan Navarro","Luanda Tavares Santana","Lucas Sena da Silva","Lucas Taniguti Bertarelli","Luciana Dellamora Pata Fernandes Lima","Lucilene Cora","Luila Chiste Lage","Luís Eduardo Oliveira Machado","Madego DF Ativos","Madego GO Ativos","Marcela S Gambelli","Marcio Nei Schubert Ribas","MARIA CAROLINA DE RODRIGUES DE SOUZA","Mariana Lopes Ribeiro De Carvalho","Mariana Paola Monteiro Ferrari","Matias Clementino Trindade dos Santos","Nabiha Kasmas Denis","Naihana Loyola Andriani","Patrícia Aparecida de Melo","Paulino José Clemente de Vasconcellos","Pedro Henrique Do Erre de Jesus","Rael Michaelsen","Reinaldo Jorge Fernandes","Renata Maria Cerqueira","Ricardo Portella Junior","Roberta de Almeida Turra Vieira","Roberta de Freitas Costa","Rodrigo Maruco Ruas de Oliveira","Sandra Maria Gervásio Sales","Seazone Brasília","Silvia Regina Costa Silva","Sônia Maria Gervásio sales","Stefanie Maria Castro","Thiago Reis","Thiago Rodrigues Pinto","Tiago dos Santos e Santos","Vinicius da Anunciação Santos","Vinicius Vieira dos Reis","Virginia De Paula Carvalho"];

const CATEGORIAS_OCORRENCIA = [
  "Ocorrência com os imóveis",
  "Ocorrência com os hóspedes",
  "Ocorrência com a Seazone",
];

function RegistrarOcorrenciaCard() {
  const [code, setCode] = useState("");
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState<{ success: boolean; message: string } | null>(null);

  const handleRegistrar = async () => {
    if (!code.trim()) return;
    setSending(true);
    setResult(null);
    try {
      const res = await fetch("/api/registrar-ocorrencia-card", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: code.trim() }),
      });
      const data = await res.json();
      if (data.success) {
        setResult({ success: true, message: data.details });
        setCode("");
      } else {
        setResult({ success: false, message: data.error || "Erro" });
      }
    } catch {
      setResult({ success: false, message: "Erro de conexão" });
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="mt-6 pt-6 border-t border-gray-200">
      <h4 className="text-sm font-semibold text-gray-700 mb-2">Registrar ocorrência no card</h4>
      <p className="text-xs text-gray-500 mb-3">Adiciona &quot;Ocorrência Registrada | DD/MM&quot; abaixo do FUP no último comentário e a tag &quot;OCORRÊNCIA REGISTRADA&quot;.</p>
      <div className="flex gap-2 items-end">
        <div>
          <label className="text-xs text-gray-500 block mb-1">Código do imóvel</label>
          <input type="text" value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} placeholder="Ex: ALA0004" className="border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500 w-40" />
        </div>
        <button onClick={handleRegistrar} disabled={sending || !code.trim()} className="bg-purple-600 text-white px-4 py-2 rounded-md text-sm font-medium hover:bg-purple-700 disabled:opacity-50 transition-colors whitespace-nowrap">
          {sending ? "Registrando..." : "Registrar no card"}
        </button>
        {result && <span className={`text-xs ${result.success ? "text-green-600" : "text-red-600"}`}>{result.message}</span>}
      </div>
    </div>
  );
}

function FormAtualizarAnuncio() {
  const [codigo, setCodigo] = useState("");
  const [tipoAlteracao, setTipoAlteracao] = useState<"Temporária" | "Permanente">("Permanente");
  const [itens, setItens] = useState("");
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState<{ success: boolean; message: string } | null>(null);

  const descricao = itens.trim() ? `INCLUIR\n${itens.trim()}` : "";

  const handleEnviar = async () => {
    setSending(true);
    setResult(null);
    try {
      const res = await fetch("/api/create-anuncio", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ codigo: codigo.trim(), tipoAlteracao, descricao }),
      });
      const data = await res.json();
      if (data.success) {
        setResult({ success: true, message: `Anúncio criado! Card #${data.cardId}` });
        setCodigo("");
        setItens("");
      } else {
        setResult({ success: false, message: data.error || "Erro ao criar" });
      }
    } catch {
      setResult({ success: false, message: "Erro de conexão" });
    } finally {
      setSending(false);
    }
  };

  return (
    <section className="bg-white rounded-lg shadow p-6 mb-6">
      <h3 className="text-lg font-semibold mb-1">Atualizar Anúncio</h3>
      <p className="text-xs text-gray-500 mb-4">Preencha e clique &quot;Enviar&quot;. O card será criado diretamente no Pipefy.</p>

      <div className="space-y-4">
        <div className="bg-gray-50 rounded-md p-4 border border-gray-200">
          <p className="text-xs text-gray-500 mb-2">Campos preenchidos automaticamente:</p>
          <div className="grid grid-cols-2 gap-2 text-xs">
            <div><span className="font-medium text-gray-700">Nome:</span> Weslley Bertoldo da Silva</div>
            <div><span className="font-medium text-gray-700">Email:</span> weslley.bertoldo@seazone.com.br</div>
            <div><span className="font-medium text-gray-700">Vínculo:</span> Time de implantação</div>
            <div><span className="font-medium text-gray-700">Tipo:</span> Informações do imóvel - Ajuste da descrição/ammenites/locomoção</div>
          </div>
        </div>

        <div>
          <label className="text-sm font-medium text-gray-700 block mb-1">Código do Imóvel</label>
          <input type="text" value={codigo} onChange={(e) => setCodigo(e.target.value.toUpperCase())} placeholder="Ex: ALA0004" className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
        </div>

        <div>
          <label className="text-sm font-medium text-gray-700 block mb-1">Alteração temporária ou permanente?</label>
          <div className="flex gap-3">
            <label className="flex items-center gap-2 text-sm">
              <input type="radio" checked={tipoAlteracao === "Permanente"} onChange={() => setTipoAlteracao("Permanente")} />
              Permanente
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input type="radio" checked={tipoAlteracao === "Temporária"} onChange={() => setTipoAlteracao("Temporária")} />
              Temporária
            </label>
          </div>
        </div>

        <div>
          <label className="text-sm font-medium text-gray-700 block mb-1">Itens para incluir</label>
          <p className="text-xs text-gray-500 mb-1">Digite os itens (um por linha). O texto &quot;INCLUIR&quot; será adicionado automaticamente.</p>
          <textarea value={itens} onChange={(e) => setItens(e.target.value)} placeholder={"Ferro de passar\nTábua de roupas\nSecador de cabelo"} rows={5} className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-500" />
        </div>

        {descricao && (
          <div className="bg-green-50 rounded-md p-4 border border-green-200">
            <p className="text-xs font-medium text-green-700 mb-2">Descrição que será enviada:</p>
            <pre className="text-xs text-green-900 whitespace-pre-wrap font-sans">{descricao}</pre>
          </div>
        )}

        {result && (
          <div className={`p-3 rounded-md text-sm ${result.success ? "bg-green-50 text-green-700 border border-green-200" : "bg-red-50 text-red-700 border border-red-200"}`}>
            {result.message}
          </div>
        )}

        <button onClick={handleEnviar} disabled={sending || !codigo.trim() || !itens.trim()} className="w-full bg-green-600 text-white py-3 rounded-md font-medium hover:bg-green-700 disabled:opacity-50 transition-colors">
          {sending ? "Enviando..." : "Enviar Atualização de Anúncio"}
        </button>
      </div>
    </section>
  );
}

function FormOcorrencia() {
  const [codigo, setCodigo] = useState("");
  const [franquia, setFranquia] = useState("");
  const [origem, setOrigem] = useState("Implantação");
  const [descricao, setDescricao] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState<{ success: boolean; message: string } | null>(null);

  const handleEnviar = async () => {
    setSending(true);
    setResult(null);
    try {
      const formData = new FormData();
      formData.append("email", "weslley.bertoldo@seazone.com.br");
      formData.append("envolveimovel", "Sim");
      formData.append("codigo", codigo.trim());
      formData.append("franquia", franquia);
      formData.append("origem", origem);
      formData.append("descricao", descricao.trim());
      if (file) formData.append("evidencia", file);

      const res = await fetch("/api/create-ocorrencia", {
        method: "POST",
        body: formData,
      });
      const data = await res.json();
      if (data.success) {
        setResult({ success: true, message: `Ocorrência criada! Card #${data.cardId}` });
        setCodigo("");
        setDescricao("");
        setFile(null);
        if (fileRef.current) fileRef.current.value = "";
      } else {
        setResult({ success: false, message: data.error || "Erro ao criar" });
      }
    } catch {
      setResult({ success: false, message: "Erro de conexão" });
    } finally {
      setSending(false);
    }
  };

  return (
    <section className="bg-white rounded-lg shadow p-6 mb-6">
      <h3 className="text-lg font-semibold mb-1">Registro de Ocorrência</h3>
      <p className="text-xs text-gray-500 mb-4">Preencha e clique &quot;Enviar&quot;. A ocorrência será criada diretamente no Pipefy.</p>

      <div className="space-y-4">
        <div>
          <label className="text-sm font-medium text-gray-700 block mb-1">E-mail Seazone do solicitante</label>
          <input type="email" value="weslley.bertoldo@seazone.com.br" readOnly className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm bg-gray-50" />
        </div>

        <div>
          <label className="text-sm font-medium text-gray-700 block mb-1">A reclamação envolve algum imóvel da Seazone?</label>
          <input type="text" value="Sim" readOnly className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm bg-gray-50" />
        </div>

        <div>
          <label className="text-sm font-medium text-gray-700 block mb-1">Código do Imóvel</label>
          <input type="text" value={codigo} onChange={(e) => setCodigo(e.target.value.toUpperCase())} placeholder="Ex: ALA0004" className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
        </div>


        <SearchableSelect
          label="Franquia do imóvel"
          value={franquia}
          onChange={setFranquia}
          options={FRANQUIAS_OCORRENCIA}
          placeholder="Digite para pesquisar..."
        />

        <div>
          <label className="text-sm font-medium text-gray-700 block mb-1">Origem da ocorrência</label>
          <select value={origem} onChange={(e) => setOrigem(e.target.value)} className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm bg-white">
            {ORIGENS_OCORRENCIA.map((o) => <option key={o} value={o}>{o}</option>)}
          </select>
        </div>

        <div>
          <label className="text-sm font-medium text-gray-700 block mb-1">Descreva o ocorrido</label>
          <textarea value={descricao} onChange={(e) => setDescricao(e.target.value)} placeholder="Descreva o ocorrido..." rows={5} className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
        </div>

        <div>
          <label className="text-sm font-medium text-gray-700 block mb-1">Evidência (print/arquivo)</label>
          <input
            ref={fileRef}
            type="file"
            accept="image/*,.pdf,.doc,.docx"
            onChange={(e) => setFile(e.target.files?.[0] || null)}
            className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm file:mr-3 file:py-1 file:px-3 file:rounded-md file:border-0 file:text-sm file:bg-orange-50 file:text-orange-700 hover:file:bg-orange-100"
          />
          {file && <p className="text-xs text-gray-500 mt-1">{file.name} ({(file.size / 1024).toFixed(0)} KB)</p>}
        </div>

        {result && (
          <div className={`p-3 rounded-md text-sm ${result.success ? "bg-green-50 text-green-700 border border-green-200" : "bg-red-50 text-red-700 border border-red-200"}`}>
            {result.message}
          </div>
        )}

        <button onClick={handleEnviar} disabled={sending || !codigo.trim() || !descricao.trim() || !franquia} className="w-full bg-orange-600 text-white py-3 rounded-md font-medium hover:bg-orange-700 disabled:opacity-50 transition-colors">
          {sending ? "Enviando..." : "Enviar Ocorrência"}
        </button>
      </div>

      {/* Registrar ocorrência no card */}
      <RegistrarOcorrenciaCard />
    </section>
  );
}

// =====================
// TAB: ENXOVAL/CSO
// =====================

interface EnxovalCsoCard {
  id: string;
  title: string;
  lastComment: string;
  tags: string[];
  hasEnxovalComprado: boolean;
}

function TabEnxovalCso() {
  const [cards, setCards] = useState<EnxovalCsoCard[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [updatingCard, setUpdatingCard] = useState<string | null>(null);
  const [cardStatuses, setCardStatuses] = useState<Record<string, { status: "updated" | "error"; message: string }>>({});

  const loadCards = async () => {
    setLoading(true);
    setError("");
    setCardStatuses({});
    try {
      const res = await fetch("/api/enxoval-cso");
      const data = await res.json();
      if (data.success) {
        setCards(data.cards);
      } else {
        setError(data.error || "Erro ao carregar");
      }
    } catch {
      setError("Erro de conexão");
    } finally {
      setLoading(false);
    }
  };

  const updateCard = async (code: string) => {
    setUpdatingCard(code);
    try {
      const res = await fetch("/api/enxoval-cso", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code }),
      });
      const data = await res.json();
      if (data.success) {
        setCardStatuses((prev) => ({ ...prev, [code]: { status: "updated", message: data.details } }));
      } else {
        setCardStatuses((prev) => ({ ...prev, [code]: { status: "error", message: data.error || "Erro" } }));
      }
    } catch {
      setCardStatuses((prev) => ({ ...prev, [code]: { status: "error", message: "Erro de conexão" } }));
    } finally {
      setUpdatingCard(null);
    }
  };

  return (
    <>
      <section className="bg-white rounded-lg shadow p-6 mb-6">
        <h2 className="text-lg font-semibold mb-2">ENXOVAL / CSO</h2>
        <p className="text-sm text-gray-500 mb-4">
          Cards da Fase 5 com enxoval pendente (❌ ENXOVAL). Mostra as tags do Pipe 0 (Onboarding). O botão atualiza o comentário e campo &quot;Validação Enxoval&quot; para &quot;COMPRADO - PP CSO&quot;.
        </p>
        <button onClick={loadCards} disabled={loading} className="bg-gray-600 text-white px-6 py-3 rounded-md font-medium hover:bg-gray-700 disabled:opacity-50 transition-colors">
          {loading ? "Carregando..." : `Carregar Cards${cards.length > 0 ? ` (${cards.length})` : ""}`}
        </button>
        {error && <p className="text-red-600 text-sm mt-3">{error}</p>}
      </section>

      {cards.length > 0 && (
        <section className="space-y-3">
          {cards.map((c) => {
            const cardStatus = cardStatuses[c.title];
            const isUpdating = updatingCard === c.title;
            return (
              <div key={c.id} className={`bg-white rounded-lg shadow p-5 border-l-4 ${cardStatus?.status === "updated" ? "border-l-green-500" : cardStatus?.status === "error" ? "border-l-red-500" : "border-l-red-400"}`}>
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-3">
                    <CopyableCode code={c.title} className="text-base" />
                    <span className="text-xs text-red-500 font-medium">❌ ENXOVAL pendente</span>
                  </div>
                  <div className="flex items-center gap-3">
                    {/* Tags do Pipe 0 */}
                    {c.hasEnxovalComprado && (
                      <span className="text-xs bg-green-100 text-green-700 px-2 py-1 rounded font-medium">ENXOVAL COMPRADO</span>
                    )}
                    {cardStatus && (
                      <span className={`text-xs ${cardStatus.status === "updated" ? "text-green-600" : "text-red-600"}`}>{cardStatus.message}</span>
                    )}
                    {!cardStatus && (
                      <button
                        onClick={() => updateCard(c.title)}
                        disabled={isUpdating || updatingCard !== null}
                        className="bg-orange-600 text-white px-4 py-2 rounded-md text-sm font-medium hover:bg-orange-700 disabled:opacity-50 transition-colors whitespace-nowrap"
                      >
                        {isUpdating ? "Atualizando..." : "Marcar COMPRADO CSO"}
                      </button>
                    )}
                  </div>
                </div>

                {/* Tags */}
                {c.tags.length > 0 && (
                  <div className="flex flex-wrap gap-1 mb-3">
                    {c.tags.map((t) => (
                      <span key={t} className={`text-[10px] px-1.5 py-0.5 rounded ${t.toUpperCase().includes("ENXOVAL") ? "bg-green-200 text-green-800" : "bg-gray-200"}`}>{t}</span>
                    ))}
                  </div>
                )}

                {/* Último comentário */}
                {c.lastComment && (
                  <div className="bg-gray-50 rounded-md p-3 border border-gray-200">
                    <pre className="text-xs text-gray-600 whitespace-pre-wrap font-sans leading-relaxed">{c.lastComment}</pre>
                  </div>
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
// MAIN APP
// =====================

export default function Home() {
  const [authenticated, setAuthenticated] = useState<boolean | null>(null);
  const [activeTab, setActiveTab] = useState<"fase3" | "fase4" | "revisao" | "fase5" | "processamento" | "ocorrencia" | "enxovalcso" | "complexa">("fase3");

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
      <div className="mb-6 bg-gray-100 p-1 rounded-lg space-y-px">
        <div className="flex gap-1">
          {([
            { id: "fase3", label: "Fase 3" },
            { id: "fase4", label: "Fase 4" },
            { id: "revisao", label: "Complexa/Revisão finalizada" },
            { id: "fase5", label: "Fase 5" },
          ] as const).map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex-1 py-2.5 px-4 rounded-md text-sm font-medium transition-colors ${
                activeTab === tab.id ? "bg-white text-gray-900 shadow-sm" : "text-gray-500 hover:text-gray-700"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
        <hr className="border-gray-200" />
        <div className="flex gap-1">
          {([
            { id: "processamento", label: "Processamento" },
            { id: "ocorrencia", label: "Ocorrência/Suportes" },
            { id: "enxovalcso", label: "ENXOVAL/CSO" },
            { id: "complexa", label: "Complexa" },
          ] as const).map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex-1 py-2.5 px-4 rounded-md text-sm font-medium transition-colors ${
                activeTab === tab.id ? "bg-white text-gray-900 shadow-sm" : "text-gray-500 hover:text-gray-700"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Tab content */}
      {activeTab === "fase3" && <TabUpdateCards apiRoute="/api/update-cards" phaseName="Fase 3" phaseDescription={'Atualiza vencimento para o próximo dia útil às 22:00, responsável para Weslley Bertoldo, e replica o último comentário com a nova data. Cards com tags "Adequação Complexa" ou "Revisão de Pendências Finalizada" são ignorados.'} />}
      {activeTab === "fase4" && <TabUpdateCards apiRoute="/api/update-cards-phase4" phaseName="Fase 4" phaseDescription="Atualiza vencimento para daqui a 2 dias úteis às 22:00 e replica o último comentário com a nova data. Só atualiza cards do Weslley com vencimento para hoje." showCopyButton />}
      {activeTab === "revisao" && <TabRevisao />}
      {activeTab === "fase5" && <TabPhase5 />}
      {activeTab === "processamento" && <TabProcessamento />}
      {activeTab === "ocorrencia" && <TabOcorrenciaSuporte />}
      {activeTab === "enxovalcso" && <TabEnxovalCso />}
      {activeTab === "complexa" && <TabComplexa />}
    </div>
  );
}
