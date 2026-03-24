"use client";

import { useState, useCallback } from "react";

interface EnxovalData {
  codigo_imovel: string;
  fronha: number;
  toalha_de_banho: number;
  toalha_de_rosto: number;
  toalha_de_piso: number;
  toalha_de_maquiagem: number;
  toalha_de_praia: number;
  manta_queen_size: number;
  lencol_ou_virol_solteiro: number;
  lencol_ou_virol_casal: number;
  lencol_ou_virol_queen_size: number;
  lencol_ou_virol_king_size: number;
  edredom_solteiro: number;
  edredom_casal: number;
  edredom_queen_size: number;
  edredom_king_size: number;
  capa_edredom_solteiro: number;
  capa_edredom_casal: number;
  capa_edredom_queen_size: number;
  capa_edredom_king_size: number;
}

interface CardResult {
  id: string;
  title: string;
}

const FIELD_LABELS: Record<keyof Omit<EnxovalData, "codigo_imovel">, string> = {
  fronha: "Fronha",
  toalha_de_banho: "Toalha de banho",
  toalha_de_rosto: "Toalha de rosto",
  toalha_de_piso: "Toalha de piso (Tapete)",
  toalha_de_maquiagem: "Toalha de maquiagem",
  toalha_de_praia: "Toalha de praia",
  manta_queen_size: "Manta queen size",
  lencol_ou_virol_solteiro: "Lençol/Virol solteiro",
  lencol_ou_virol_casal: "Lençol/Virol casal",
  lencol_ou_virol_queen_size: "Lençol/Virol queen",
  lencol_ou_virol_king_size: "Lençol/Virol king",
  edredom_solteiro: "Edredom solteiro",
  edredom_casal: "Edredom casal",
  edredom_queen_size: "Edredom queen",
  edredom_king_size: "Edredom king",
  capa_edredom_solteiro: "Capa edredom solteiro",
  capa_edredom_casal: "Capa edredom casal",
  capa_edredom_queen_size: "Capa edredom queen",
  capa_edredom_king_size: "Capa edredom king",
};

export default function Home() {
  const [cardId, setCardId] = useState("");
  const [cardSearch, setCardSearch] = useState("");
  const [cardResults, setCardResults] = useState<CardResult[]>([]);
  const [selectedCard, setSelectedCard] = useState<CardResult | null>(null);
  const [searching, setSearching] = useState(false);
  const [pdfFile, setPdfFile] = useState<File | null>(null);
  const [data, setData] = useState<EnxovalData | null>(null);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [rawText, setRawText] = useState("");
  const [showRaw, setShowRaw] = useState(false);

  const searchCard = useCallback(async (query: string) => {
    if (!query) return;
    setSearching(true);
    setCardResults([]);
    setSelectedCard(null);
    setCardId("");

    try {
      const res = await fetch(`/api/search-card?q=${encodeURIComponent(query)}`);
      const result = await res.json();
      if (result.success && result.cards.length > 0) {
        setCardResults(result.cards);
        // If exact match (1 result), auto-select
        if (result.cards.length === 1) {
          setSelectedCard(result.cards[0]);
          setCardId(result.cards[0].id);
        }
      } else {
        setCardResults([]);
      }
    } catch {
      // ignore
    } finally {
      setSearching(false);
    }
  }, []);

  const handleParsePdf = useCallback(async () => {
    if (!pdfFile) return;
    setLoading(true);
    setMessage(null);

    try {
      const formData = new FormData();
      formData.append("pdf", pdfFile);

      const res = await fetch("/api/parse-pdf", {
        method: "POST",
        body: formData,
      });

      const result = await res.json();
      if (result.success) {
        setData(result.data);
        setRawText(result.rawText || "");

        // Auto-search card by código do imóvel
        if (result.data.codigo_imovel) {
          setCardSearch(result.data.codigo_imovel);
          searchCard(result.data.codigo_imovel);
        }
      } else {
        setMessage({ type: "error", text: result.error });
      }
    } catch {
      setMessage({ type: "error", text: "Erro ao processar o PDF" });
    } finally {
      setLoading(false);
    }
  }, [pdfFile, searchCard]);

  const handleSubmit = useCallback(async () => {
    if (!data) return;
    setSubmitting(true);
    setMessage(null);

    try {
      const formData = new FormData();
      formData.append("data", JSON.stringify(data));
      if (cardId) formData.append("cardId", cardId);
      if (pdfFile) formData.append("pdf", pdfFile);

      const res = await fetch("/api/submit-pipefy", {
        method: "POST",
        body: formData,
      });

      const result = await res.json();
      if (result.success) {
        setMessage({
          type: "success",
          text: `Registro #${result.recordId} criado com sucesso!${selectedCard ? ` Conectado ao card ${selectedCard.title}` : ""}`,
        });
      } else {
        setMessage({
          type: "error",
          text: result.error + (result.details ? `: ${JSON.stringify(result.details)}` : ""),
        });
      }
    } catch {
      setMessage({ type: "error", text: "Erro ao enviar dados ao Pipefy" });
    } finally {
      setSubmitting(false);
    }
  }, [data, cardId, pdfFile, selectedCard]);

  const updateField = (key: keyof EnxovalData, value: string) => {
    if (!data) return;
    setData({
      ...data,
      [key]: key === "codigo_imovel" ? value : Number(value) || 0,
    });
  };

  return (
    <div className="max-w-4xl mx-auto p-6">
      <header className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900">
          Pipefy Enxoval
        </h1>
        <p className="text-gray-500 mt-1">
          Automação de registro de enxoval — Seazone
        </p>
      </header>

      {/* Upload PDF */}
      <section className="bg-white rounded-lg shadow p-6 mb-6">
        <h2 className="text-lg font-semibold mb-4">1. Upload do PDF de Enxoval</h2>
        <div className="flex items-center gap-4">
          <label className="flex-1">
            <div className="border-2 border-dashed border-gray-300 rounded-lg p-6 text-center cursor-pointer hover:border-blue-400 transition-colors">
              <input
                type="file"
                accept=".pdf"
                onChange={(e) => {
                  setPdfFile(e.target.files?.[0] || null);
                  setData(null);
                  setMessage(null);
                  setSelectedCard(null);
                  setCardResults([]);
                  setCardId("");
                  setCardSearch("");
                }}
                className="hidden"
              />
              {pdfFile ? (
                <p className="text-sm text-green-700 font-medium">
                  {pdfFile.name}
                </p>
              ) : (
                <p className="text-sm text-gray-500">
                  Clique para selecionar o PDF do enxoval
                </p>
              )}
            </div>
          </label>
          <button
            onClick={handleParsePdf}
            disabled={!pdfFile || loading}
            className="bg-blue-600 text-white px-6 py-3 rounded-md font-medium hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {loading ? "Processando..." : "Ler PDF"}
          </button>
        </div>
      </section>

      {/* Data Preview/Edit */}
      {data && (
        <section className="bg-white rounded-lg shadow p-6 mb-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold">
              2. Dados Extraídos — {data.codigo_imovel}
            </h2>
            <button
              onClick={() => setShowRaw(!showRaw)}
              className="text-xs text-gray-500 underline"
            >
              {showRaw ? "Ocultar texto bruto" : "Ver texto bruto"}
            </button>
          </div>

          {showRaw && (
            <pre className="bg-gray-100 p-3 rounded text-xs mb-4 max-h-48 overflow-auto whitespace-pre-wrap">
              {rawText}
            </pre>
          )}

          <div className="mb-4">
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Código do Imóvel
            </label>
            <input
              type="text"
              value={data.codigo_imovel}
              onChange={(e) => updateField("codigo_imovel", e.target.value)}
              className="border border-gray-300 rounded-md px-3 py-2 text-sm w-48 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
            {(Object.keys(FIELD_LABELS) as Array<keyof typeof FIELD_LABELS>).map((key) => (
              <div key={key}>
                <label className="block text-xs font-medium text-gray-600 mb-1">
                  {FIELD_LABELS[key]}
                </label>
                <input
                  type="number"
                  min={0}
                  value={data[key]}
                  onChange={(e) => updateField(key, e.target.value)}
                  className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            ))}
          </div>

          <div className="mt-4 p-3 bg-gray-50 rounded text-xs text-gray-600">
            <strong>Campos fixos:</strong> Data de compra = hoje | Validação da marca = 0 | PDF será anexado como comprovante
          </div>
        </section>
      )}

      {/* Card Search & Submit */}
      {data && (
        <section className="bg-white rounded-lg shadow p-6 mb-6">
          <h2 className="text-lg font-semibold mb-4">3. Conectar ao Card e Enviar</h2>

          {/* Search */}
          <div className="mb-4">
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Buscar Card (nome do imóvel ou ID)
            </label>
            <div className="flex gap-2">
              <input
                type="text"
                value={cardSearch}
                onChange={(e) => setCardSearch(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") searchCard(cardSearch); }}
                placeholder="Ex: ALA0004 ou 1318344701"
                className="flex-1 border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <button
                onClick={() => searchCard(cardSearch)}
                disabled={!cardSearch || searching}
                className="bg-gray-700 text-white px-4 py-2 rounded-md text-sm font-medium hover:bg-gray-800 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {searching ? "Buscando..." : "Buscar"}
              </button>
            </div>
          </div>

          {/* Results */}
          {cardResults.length > 1 && (
            <div className="mb-4 border border-gray-200 rounded-md divide-y">
              {cardResults.map((card) => (
                <button
                  key={card.id}
                  onClick={() => {
                    setSelectedCard(card);
                    setCardId(card.id);
                    setCardResults([]);
                  }}
                  className={`w-full text-left px-4 py-2 text-sm hover:bg-blue-50 transition-colors ${
                    selectedCard?.id === card.id ? "bg-blue-50 font-medium" : ""
                  }`}
                >
                  <span className="font-medium">{card.title}</span>
                  <span className="text-gray-400 ml-2">ID: {card.id}</span>
                </button>
              ))}
            </div>
          )}

          {/* Selected card */}
          {selectedCard && (
            <div className="mb-4 p-3 bg-blue-50 border border-blue-200 rounded-md flex items-center justify-between">
              <span className="text-sm">
                Card selecionado: <strong>{selectedCard.title}</strong>
                <span className="text-gray-500 ml-2">(ID: {selectedCard.id})</span>
              </span>
              <button
                onClick={() => { setSelectedCard(null); setCardId(""); }}
                className="text-xs text-red-500 hover:text-red-700"
              >
                Remover
              </button>
            </div>
          )}

          {cardSearch && !searching && cardResults.length === 0 && !selectedCard && (
            <p className="mb-4 text-sm text-yellow-600">
              Nenhum card encontrado na Fase 5 com esse nome/ID.
            </p>
          )}

          {/* Submit */}
          <button
            onClick={handleSubmit}
            disabled={submitting}
            className="bg-green-600 text-white px-8 py-3 rounded-md font-medium hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {submitting ? "Enviando..." : "Criar Registro no Pipefy"}
          </button>

          {!selectedCard && (
            <p className="text-gray-400 text-xs mt-2">
              Sem card selecionado — o registro será criado na tabela sem conexão a um card.
            </p>
          )}
        </section>
      )}

      {/* Messages */}
      {message && (
        <div
          className={`p-4 rounded-lg ${
            message.type === "success"
              ? "bg-green-50 border border-green-200 text-green-800"
              : "bg-red-50 border border-red-200 text-red-800"
          }`}
        >
          {message.text}
        </div>
      )}
    </div>
  );
}
