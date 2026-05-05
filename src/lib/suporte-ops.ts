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
  // Pega todas as 5 fases (novo / em_andamento / aguardando / concluido / arquivado)
  const path = `/cards?processo_id=eq.${PROCESSO_TROCA_ID}&status=in.(novo,em_andamento,aguardando,concluido,arquivado)&order=created_at.desc&limit=200`;
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
// Mapeamento status do Supabase → 5 fases visuais (espelham o site suporte-ops)
// ========================

export type FaseUI =
  | "Novo"
  | "Em Andamento"
  | "Aguardando"
  | "Concluído"
  | "Arquivado";

export function statusParaFase(status: SuporteStatus): FaseUI | null {
  if (status === "novo") return "Novo";
  if (status === "em_andamento") return "Em Andamento";
  if (status === "aguardando") return "Aguardando";
  if (status === "concluido") return "Concluído";
  if (status === "arquivado") return "Arquivado";
  return null;
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

// User Weslley no Supabase suporte-ops (id valido em `usuarios`, descoberto
// via autor_id dos comentarios reais — o id antigo "3b09cea1-..." nao existia
// na tabela e quebrava INSERT em `comentarios` com FK 23503 silencioso).
export const SUPORTE_USER_WESLLEY = "8ca20d1b-8631-471d-87f0-9c6dfb9f38b6";

// Lê definição do processo (incluindo botao_mensagem dos campos_gestao_json)
export async function getProcesso(id: string): Promise<any | null> {
  const r = await suporteFetch(`/processos?id=eq.${encodeURIComponent(id)}&limit=1`);
  if (!r.ok) {
    const txt = await r.text().catch(() => "");
    throw new Error(`Supabase GET processo ${id}: ${r.status} ${txt.slice(0, 200)}`);
  }
  const arr = await r.json();
  return Array.isArray(arr) && arr[0] ? arr[0] : null;
}

// Pega nome do responsável do card (pra resolver {responsavel} no template)
export async function getNomeUsuario(usuarioId: string): Promise<string> {
  if (!usuarioId) return "";
  try {
    const r = await suporteFetch(
      `/usuarios?id=eq.${encodeURIComponent(usuarioId)}&select=nome&limit=1`
    );
    if (!r.ok) return "";
    const arr = await r.json();
    return arr?.[0]?.nome || "";
  } catch {
    return "";
  }
}

// Insere comentário no card. `autor_id` pode ser usuário do Supabase suporte-ops.
export async function addSuporteComment(
  cardId: string,
  autorId: string,
  texto: string,
  via: string = "app"
): Promise<any> {
  const r = await suporteFetch(`/comentarios?select=*`, {
    method: "POST",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify({
      card_id: cardId,
      autor_id: autorId,
      texto,
      via,
    }),
  });
  if (!r.ok) {
    const txt = await r.text().catch(() => "");
    throw new Error(
      `Supabase POST comentario ${cardId}: ${r.status} ${txt.slice(0, 200)}`
    );
  }
  const arr = await r.json();
  return Array.isArray(arr) ? arr[0] : arr;
}

// Invoca a Edge Function `notify-slack` (mesma usada pelo site quando user
// clica Salvar/Comentar/etc.). O Edge encaminha pro Slack workspace correto.
export async function invokeNotifySlack(payload: Record<string, any>): Promise<any> {
  const url = `${SUPORTE_URL}/functions/v1/notify-slack`;
  const r = await suporteFetch(url, {
    method: "POST",
    body: JSON.stringify(payload),
  });
  if (!r.ok) {
    const txt = await r.text().catch(() => "");
    throw new Error(`notify-slack ${r.status}: ${txt.slice(0, 200)}`);
  }
  return r.json();
}

// Resolve variáveis do `botao_mensagem` template ({Status do imóvel},
// {Código Antigo}, {Novo Código}, @{responsavel}). Substituições case-sensitive
// como no site original.
export function resolverTemplateBotao(
  template: string,
  vars: Record<string, string>
): string {
  let out = template;
  for (const [k, v] of Object.entries(vars)) {
    // @{responsavel} ou {responsavel}
    const reAtKey = new RegExp(`@\\{${k}\\}`, "g");
    const reKey = new RegExp(`\\{${k}\\}`, "g");
    out = out.replace(reAtKey, v || "").replace(reKey, v || "");
  }
  return out;
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
