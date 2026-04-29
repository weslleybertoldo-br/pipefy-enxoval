// ========================
// Módulo compartilhado Pipefy
// ========================

const PIPEFY_API = "https://api.pipefy.com/graphql";
const PIPEFY_TOKEN = process.env.PIPEFY_TOKEN || "";

export const PIPE_ID = "303828424";
export const PIPE_ID_TROCA = "304170945";
export const PHASE_3_ID = "323529403";
export const PHASE_4_ID = "333848207";
export const PHASE_5_ID = "333848127";
export const WESLLEY_USER_ID = "305932218";

// Pipe 1 - fases 1 a 10 (exclui Fase 11 para evitar duplicatas)
export const PIPE_1_PHASES: { id: string; name: string }[] = [
  { id: "323044780", name: "Backlog" },
  { id: "333371452", name: "Fase 0" },
  { id: "323044781", name: "Fase 1" },
  { id: "323044783", name: "Fase 2" },
  { id: "323044784", name: "Fase 3" },
  { id: "323044785", name: "Fase 4" },
  { id: "323044786", name: "Fase 5" },
  { id: "323044787", name: "Fase 6" },
  { id: "323044796", name: "Fase 7" },
  { id: "323044844", name: "Fase 8" },
  { id: "323044836", name: "Fase 9" },
  { id: "326702699", name: "Fase 10" },
];

/**
 * Busca todos os cards das 12 fases do Pipe 1 em paralelo e retorna um
 * Map<titleUpper, phaseName>. Usado pelas abas de Fase 3/4/Ativos pra
 * mostrar em que fase cada imóvel está no Pipe 1.
 */
export async function fetchPipe1PhaseMap(): Promise<Map<string, string>> {
  const results = await Promise.all(
    PIPE_1_PHASES.map(async (phase) => {
      const cards = await fetchAllCardsFromPhase(phase.id);
      return { name: phase.name, cards };
    })
  );
  const map = new Map<string, string>();
  for (const { name, cards } of results) {
    for (const c of cards) {
      if (!c.title) continue;
      map.set(c.title.toUpperCase().trim(), name);
    }
  }
  return map;
}

// ========================
// Query com tratamento de erros e timeout
// ========================

export async function pipefyQuery(query: string) {
  if (!PIPEFY_TOKEN) throw new Error("PIPEFY_TOKEN não configurado");

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30000); // 30s timeout

  try {
    const res = await fetch(PIPEFY_API, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${PIPEFY_TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ query }),
      signal: controller.signal,
    });

    if (!res.ok) {
      throw new Error(`Pipefy API HTTP ${res.status}: ${res.statusText}`);
    }

    const result = await res.json();

    if (result.errors?.length) {
      throw new Error(`Pipefy GraphQL: ${result.errors[0].message}`);
    }

    return result;
  } finally {
    clearTimeout(timeout);
  }
}

// ========================
// Timezone helpers
// ========================

export function toBrazilDate(date: Date): { day: number; month: number; year: number; dayOfWeek: number } {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    weekday: "short",
  });
  const parts = formatter.formatToParts(date);
  const day = parseInt(parts.find((p) => p.type === "day")!.value);
  const month = parseInt(parts.find((p) => p.type === "month")!.value) - 1;
  const year = parseInt(parts.find((p) => p.type === "year")!.value);

  // Calcular dayOfWeek via Date construída
  const d = new Date(year, month, day);
  return { day, month, year, dayOfWeek: d.getDay() };
}

export function formatDateBR(isoDate: string): string {
  const br = toBrazilDate(new Date(isoDate));
  return `${String(br.day).padStart(2, "0")}/${String(br.month + 1).padStart(2, "0")}/${br.year}`;
}

export function isDueToday(dueDateStr: string): boolean {
  const dueDate = toBrazilDate(new Date(dueDateStr));
  const today = toBrazilDate(new Date());
  return dueDate.year === today.year && dueDate.month === today.month && dueDate.day === today.day;
}

// ========================
// Cálculo de dias úteis
// ========================

function addBusinessDays(fromDate: Date, days: number): Date {
  const d = new Date(fromDate.toLocaleString("en-US", { timeZone: "America/Sao_Paulo" }));
  let added = 0;
  while (added < days) {
    d.setDate(d.getDate() + 1);
    const dow = d.getDay();
    if (dow !== 0 && dow !== 6) added++;
  }
  return d;
}

function formatAsISO22BRT(date: Date): string {
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const dd = String(date.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}T22:00:00-03:00`;
}

export function getNextBusinessDayAt22(plusDays: number, fromDate?: string): string {
  const base = fromDate ? new Date(fromDate) : new Date();
  const next = addBusinessDays(base, plusDays);
  return formatAsISO22BRT(next);
}

// ========================
// Validação de cardId (previne GraphQL injection)
// ========================

export function validateCardId(cardId: unknown): string {
  const id = String(cardId);
  if (!/^\d+$/.test(id)) throw new Error("cardId inválido");
  return id;
}

// ========================
// Mutations
// ========================

export async function updateDueDate(cardId: string, dueDate: string) {
  return pipefyQuery(`mutation {
    updateCard(input: { id: ${validateCardId(cardId)}, due_date: "${dueDate}" }) {
      card { id due_date }
    }
  }`);
}

export async function updateAssignee(cardId: string, userId: string) {
  return pipefyQuery(`mutation {
    updateCard(input: { id: ${validateCardId(cardId)}, assignee_ids: ["${userId}"] }) {
      card { id assignees { id name } }
    }
  }`);
}

export async function updateCardTitle(cardId: string, title: string) {
  const escaped = sanitizeGraphQL(title);
  return pipefyQuery(`mutation {
    updateCard(input: { id: ${validateCardId(cardId)}, title: "${escaped}" }) {
      card { id title }
    }
  }`);
}

// ========================
// Buscar cards por título dentro de um pipe (todas as fases)
// ========================
//
// `findCards(pipeId)` da API exige `fieldId`+`fieldValue` (busca por custom field),
// não aceita `title`. A alternativa que funciona é aninhar
// `pipe { phases { cards(search: { title }) } }` — uma chamada cobre o pipe inteiro.

export interface PipeCardMatch {
  cardId: string;
  title: string;
  url: string | null;
  phaseId: string;
  phaseName: string;
}

export async function findCardsByTitleInPipe(
  pipeId: string,
  title: string
): Promise<PipeCardMatch[]> {
  const escaped = sanitizeGraphQL(title);
  // pipeId precisa ser numérico — deixar Pipefy aceitar como ID via aspas
  const result = await pipefyQuery(`{
    pipe(id: "${pipeId}") {
      phases {
        id
        name
        cards(first: 30, search: { title: "${escaped}" }) {
          edges {
            node { id title url }
          }
        }
      }
    }
  }`);

  const phases = result?.data?.pipe?.phases || [];
  const out: PipeCardMatch[] = [];
  for (const ph of phases) {
    const edges = ph?.cards?.edges || [];
    for (const e of edges) {
      out.push({
        cardId: e.node.id,
        title: e.node.title || "",
        url: e.node.url || null,
        phaseId: ph.id,
        phaseName: ph.name || "",
      });
    }
  }
  return out;
}

export async function createComment(cardId: string, text: string) {
  // Escape completo via JSON.stringify
  const escaped = JSON.stringify(text).slice(1, -1); // remove aspas externas
  return pipefyQuery(`mutation {
    createComment(input: { card_id: ${validateCardId(cardId)}, text: "${escaped}" }) {
      comment { id text }
    }
  }`);
}

// ========================
// Fetch cards com paginação segura
// ========================

export async function fetchAllCardsFromPhase(phaseId: string): Promise<any[]> {
  let allCards: any[] = [];
  let cursor: string | undefined;
  let pages = 0;
  const MAX_PAGES = 50;

  while (pages < MAX_PAGES) {
    const afterClause = cursor ? `, after: "${cursor}"` : "";
    const result = await pipefyQuery(`{
      phase(id: ${phaseId}) {
        cards(first: 50${afterClause}) {
          edges {
            node {
              id title due_date
              labels { id name }
              assignees { id name email }
              comments { id text created_at author_name }
            }
          }
          pageInfo { hasNextPage endCursor }
        }
      }
    }`);

    const data = result?.data?.phase?.cards;
    const edges = data?.edges || [];
    if (edges.length === 0) break;

    allCards = [...allCards, ...edges.map((e: any) => e.node)];

    if (!data?.pageInfo?.hasNextPage) break;
    cursor = data.pageInfo.endCursor;
    if (!cursor) break;
    pages++;
  }

  if (pages >= MAX_PAGES) {
    console.warn(`fetchAllCardsFromPhase: máximo de ${MAX_PAGES} páginas atingido para fase ${phaseId} — resultados podem estar truncados`);
  }

  return allCards;
}

// ========================
// Comentário: substituir data do FUP
// ========================

export function replaceCommentFupDate(text: string, newDueDateBR: string): string {
  const newShort = newDueDateBR.slice(0, 5); // "DD/MM"
  return text.replace(
    /(FUP:?\s*)(\d{2})[\/.](\d{2})(?:[\/.](\d{4}))?(\.)?/gi,
    (_match: string, prefix: string, _day: string, _month: string, year: string, trailingDot: string) => {
      const dot = trailingDot || "";
      if (year) return `${prefix}${newDueDateBR}${dot}`;
      return `${prefix}${newShort}${dot}`;
    }
  );
}

// ========================
// Tags de skip (Fase 3)
// ========================

const SKIP_TAGS = [
  "ADEQUAÇÃO COMPLEXA",
  "REVISÃO DE PENDÊNCIAS FINALIZADA",
  "REVISÃO DE PENDENCIAS FINALIZADA",
  "REVISÃO DE PENDENCIAS FINALIZADAS",
  "REVISÃO DE PENDÊNCIAS FINALIZADAS",
];

function normalize(str: string): string {
  return str.toUpperCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

export function hasSkipTag(card: any): { skip: boolean; reason: string } {
  const labels = card.labels || [];
  const found = labels.some((label: any) => {
    const name = normalize(label.name || "");
    return SKIP_TAGS.some((tag) => name.includes(normalize(tag)));
  });
  if (found) {
    return { skip: true, reason: `Tag: ${labels.map((l: any) => l.name).join(", ")}` };
  }
  return { skip: false, reason: "" };
}

// ========================
// Auth helper para rotas (verifica assinatura HMAC do token)
// ========================

export function requireAuth(cookieValue: string | undefined): boolean {
  if (!cookieValue || cookieValue.length < 10) return false;
  try {
    const { createHmac } = require("crypto");
    const secret = process.env.TOKEN_SECRET;
    if (!secret) return false;
    const decoded = Buffer.from(cookieValue, "base64").toString();
    const parts = decoded.split(":");
    if (parts.length < 3) return false;
    const signature = parts.pop()!;
    const payload = parts.join(":");
    const expected = createHmac("sha256", secret).update(payload).digest("hex");
    const { timingSafeEqual } = require("crypto");
    if (!timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) return false;
    // Verificar expiração (24h)
    const timestamp = parseInt(parts[1]);
    if (isNaN(timestamp) || Date.now() - timestamp > 24 * 60 * 60 * 1000) return false;
    return true;
  } catch {
    return false;
  }
}

// Sanitizar string para GraphQL (previne injection)
export function sanitizeGraphQL(str: string): string {
  return JSON.stringify(str).slice(1, -1);
}

// ========================
// Buscar card individual por título numa fase
// ========================

export async function searchCardInPhase(phaseId: string, title: string): Promise<any | null> {
  const escaped = sanitizeGraphQL(title);
  const result = await pipefyQuery(`{
    phase(id: ${phaseId}) {
      cards(first: 5, search: { title: "${escaped}" }) {
        edges {
          node {
            id title due_date
            labels { id name }
            assignees { id name email }
            comments { id text created_at author_name }
            fields {
              name value
              connected_repo_items { ... on TableRecord { id title } ... on Card { id title } }
            }
          }
        }
      }
    }
  }`);
  const edges = result?.data?.phase?.cards?.edges || [];
  const match = edges.find((e: any) => e.node.title.toUpperCase() === title.toUpperCase());
  return match?.node || null;
}
