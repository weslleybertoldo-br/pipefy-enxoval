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
  const [token, setToken] = useState("");
  const [cardId, setCardId] = useState("");
  const [pdfFile, setPdfFile] = useState<File | null>(null);
  const [data, setData] = useState<EnxovalData | null>(null);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [rawText, setRawText] = useState("");
  const [showRaw, setShowRaw] = useState(false);

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
      } else {
        setMessage({ type: "error", text: result.error });
      }
    } catch {
      setMessage({ type: "error", text: "Erro ao processar o PDF" });
    } finally {
      setLoading(false);
    }
  }, [pdfFile]);

  const handleSubmit = useCallback(async () => {
    if (!data || !token) return;
    setSubmitting(true);
    setMessage(null);

    try {
      const formData = new FormData();
      formData.append("data", JSON.stringify(data));
      formData.append("token", token);
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
          text: `Registro #${result.recordId} criado com sucesso!`,
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
  }, [data, token, cardId, pdfFile]);

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

      {/* Config */}
      <section className="bg-white rounded-lg shadow p-6 mb-6">
        <h2 className="text-lg font-semibold mb-4">Configuração</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Token API Pipefy
            </label>
            <input
              type="password"
              value={token}
              onChange={(e) => setToken(e.target.value)}
              placeholder="eyJhbGci..."
              className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              ID do Card (opcional — para conectar ao card)
            </label>
            <input
              type="text"
              value={cardId}
              onChange={(e) => setCardId(e.target.value)}
              placeholder="Ex: 1273397183"
              className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
        </div>
      </section>

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

      {/* Submit */}
      {data && (
        <section className="bg-white rounded-lg shadow p-6 mb-6">
          <h2 className="text-lg font-semibold mb-4">3. Enviar para o Pipefy</h2>
          <button
            onClick={handleSubmit}
            disabled={!token || submitting}
            className="bg-green-600 text-white px-8 py-3 rounded-md font-medium hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {submitting ? "Enviando..." : "Criar Registro no Pipefy"}
          </button>
          {!token && (
            <p className="text-red-500 text-sm mt-2">
              Preencha o token da API acima
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
