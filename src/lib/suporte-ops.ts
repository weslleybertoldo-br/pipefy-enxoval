// ========================
// Cliente do Supabase do site Suporte Unificado Operação (suporte-ops.seazone.properties)
// Backend: fxjpnamoafzomqlncdyn — anon key é pública (vem do bundle JS) e RLS deixa
// ler `cards`, `processos`, `areas` etc. com só a anon.
// ========================

const SUPORTE_URL =
  process.env.SUPORTE_OPS_SUPABASE_URL ||
  "https://fxjpnamoafzomqlncdyn.supabase.co";
const SUPORTE_ANON =
  process.env.SUPORTE_OPS_SUPABASE_ANON_KEY ||
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZ4anBuYW1vYWZ6b21xbG5jZHluIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzUwNzM0MTAsImV4cCI6MjA5MDY0OTQxMH0.69uyyWzQGxeeSx9dhH8GWAhUZfFIgXvW-vbCCiqvEXA";

// id do processo "Troca de Código de Imóvel" na tabela `processos`
export const PROCESSO_TROCA_ID = "e6fa26ba-c44d-49f3-b4c4-8050c3636ec3";

export type SuporteStatus =
  | "novo"
  | "em_andamento"
  | "aguardando"
  | "concluido"
  | "arquivado";

export interface SuporteCardRaw {
  id: string;
  codigo_imovel: string | null;
  area_id: string | null;
  processo_id: string;
  solicitante_id: string | null;
  responsavel_id: string | null;
  urgencia: string | null;
  status: SuporteStatus;
  descricao: string | null;
  sla_deadline: string | null;
  posicao: number | null;
  slack_ts: string | null;
  slack_channel: string | null;
  created_at: string;
  updated_at: string;
  concluded_at: string | null;
  tags: string[];
  titulo: string | null;
  campos_preenchidos: Record<string, Record<string, any>> | null;
}

export async function suporteFetch(
  path: string,
  init: RequestInit = {}
): Promise<Response> {
  const url = path.startsWith("http")
    ? path
    : `${SUPORTE_URL}/rest/v1${path.startsWith("/") ? "" : "/"}${path}`;
  const headers: Record<string, string> = {
    apikey: SUPORTE_ANON,
    Authorization: `Bearer ${SUPORTE_ANON}`,
    "Content-Type": "application/json",
    ...((init.headers as Record<string, string>) || {}),
  };
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30000);
  try {
    const res = await fetch(url, { ...init, headers, signal: controller.signal });
    return res;
  } finally {
    clearTimeout(timeout);
  }
}

export async function listarSuportesTroca(): Promise<SuporteCardRaw[]> {
  // Pega tudo exceto arquivado, ordenado por created_at desc
  const path = `/cards?processo_id=eq.${PROCESSO_TROCA_ID}&status=in.(novo,em_andamento,aguardando,concluido)&order=created_at.desc&limit=200`;
  const res = await suporteFetch(path);
  if (!res.ok) {
    const txt = await res.text().catch(() => "");
    throw new Error(`Supabase suporte-ops ${res.status}: ${txt.slice(0, 200)}`);
  }
  return res.json();
}

// ========================
// Parser dos campos de um card de Troca de Código
// ========================

export interface TrocaCampos {
  codigoAntigo: string;
  codigoNovo: string;
  solicitante: string;
  observacao: string;
  // Da fase em_andamento:
  statusImovel: string;
  alteradoBaseCodigo: boolean;
  alteradoSapron: boolean;
  alteradoPipefy: boolean;
  alteradoStays: boolean;
  // Da fase aguardando:
  alteradoPipedrive: boolean;
  alteradoOtas: boolean;
  alteradoPipefyCsProp: boolean;
}

function parseCamposAdicionais(descricao: string | null): Record<string, string> {
  if (!descricao) return {};
  const idx = descricao.lastIndexOf("--- Campos adicionais ---");
  if (idx < 0) return {};
  const trecho = descricao.slice(idx + "--- Campos adicionais ---".length);
  const out: Record<string, string> = {};
  for (const lineRaw of trecho.split(/\r?\n/)) {
    const line = lineRaw.replace(/\\n/g, "").trim();
    if (!line) continue;
    const m = line.match(/^([^:]+):\s*(.*)$/);
    if (m) {
      const k = m[1].trim();
      const v = m[2].trim();
      if (k && v && !out[k]) out[k] = v;
    }
  }
  return out;
}

function asBool(v: any): boolean {
  if (v === true) return true;
  if (typeof v === "string") return ["true", "sim", "yes", "1"].includes(v.toLowerCase());
  return false;
}

export function extrairCamposTroca(card: SuporteCardRaw): TrocaCampos {
  const cp = card.campos_preenchidos || {};
  const novo: Record<string, any> = (cp.novo as any) || {};
  const andamento: Record<string, any> = (cp.em_andamento as any) || {};
  const aguardando: Record<string, any> = (cp.aguardando as any) || {};

  // Fallback: parse da descrição se campos_preenchidos.novo veio vazio ou esquisito
  const fallback = parseCamposAdicionais(card.descricao);

  const get = (k: string): string => {
    const v = novo[k];
    if (typeof v === "string" && v.trim()) return v.trim();
    if (typeof fallback[k] === "string" && fallback[k].trim()) return fallback[k].trim();
    return "";
  };

  return {
    codigoAntigo: get("Código Antigo") || (card.codigo_imovel && card.codigo_imovel !== "SEM-CODIGO" ? card.codigo_imovel : ""),
    codigoNovo: get("Novo Código"),
    solicitante: get("Quem Solicitou"),
    observacao: get("Observação"),
    statusImovel: typeof andamento["Status do imóvel"] === "string" ? andamento["Status do imóvel"] : "",
    alteradoBaseCodigo: asBool(andamento["Alterado na base de código"]),
    alteradoSapron: asBool(andamento["Alterado no Sapron"]),
    alteradoPipefy: asBool(andamento["Alterado no Pipefy"]),
    alteradoStays: asBool(andamento["Alterado na Stays"]),
    alteradoPipedrive: asBool(aguardando["Alterado no Pipedrive"]),
    alteradoOtas: asBool(aguardando["Alterado nas OTAs?"]),
    alteradoPipefyCsProp: asBool(aguardando["Alterado no Pipefy - CS Prop"]),
  };
}

// ========================
// Mapeamento de status do Supabase → 3 fases visuais (Backlog/Fazendo/Concluído)
// ========================

export type FaseUI = "Backlog" | "Fazendo" | "Concluído";

export function statusParaFase(status: SuporteStatus): FaseUI | null {
  if (status === "novo") return "Backlog";
  if (status === "em_andamento" || status === "aguardando") return "Fazendo";
  if (status === "concluido") return "Concluído";
  return null; // arquivado
}

// URL pra abrir o card no site suporte-ops
export function urlSuporteCard(cardId: string): string {
  return `https://suporte-ops.seazone.properties/kanban?card=${cardId}`;
}

// ========================
// Update de card do suporte-ops
// ========================
// Anon key tem permissão de UPDATE em `cards` (testado 30/04/2026 — RLS
// liberada pra anon escrever; o site usa Google OAuth pra UI mas o
// endpoint REST não exige JWT pra mutate).

export async function getSuporteCard(cardId: string): Promise<SuporteCardRaw | null> {
  const r = await suporteFetch(`/cards?id=eq.${encodeURIComponent(cardId)}&limit=1`);
  if (!r.ok) {
    const txt = await r.text().catch(() => "");
    throw new Error(`Supabase GET card ${cardId}: ${r.status} ${txt.slice(0, 200)}`);
  }
  const arr = await r.json();
  return Array.isArray(arr) && arr[0] ? arr[0] : null;
}

export async function updateSuporteCard(
  cardId: string,
  patch: Partial<SuporteCardRaw>
): Promise<SuporteCardRaw | null> {
  const r = await suporteFetch(
    `/cards?id=eq.${encodeURIComponent(cardId)}&select=*`,
    {
      method: "PATCH",
      headers: { Prefer: "return=representation" },
      body: JSON.stringify(patch),
    }
  );
  if (!r.ok) {
    const txt = await r.text().catch(() => "");
    throw new Error(
      `Supabase PATCH card ${cardId}: ${r.status} ${txt.slice(0, 200)}`
    );
  }
  const arr = await r.json();
  // RLS pode silenciar UPDATE retornando array vazio; checar pra não fingir sucesso.
  if (!Array.isArray(arr) || arr.length === 0) {
    throw new Error(
      `Supabase PATCH card ${cardId}: 0 linhas atualizadas (RLS bloqueou ou id não existe)`
    );
  }
  return arr[0];
}
