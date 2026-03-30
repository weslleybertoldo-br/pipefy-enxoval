// ========================
// Módulo compartilhado Pipefy
// ========================

const PIPEFY_API = "https://api.pipefy.com/graphql";
const PIPEFY_TOKEN = process.env.PIPEFY_TOKEN || "";

export const PIPE_ID = "303828424";
export const PHASE_3_ID = "323529403";
export const PHASE_4_ID = "333848207";
export const PHASE_5_ID = "333848127";
export const WESLLEY_USER_ID = "305932218";

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
// Auth helper para rotas (verifica existência do cookie)
// A validação do token HMAC é feita no endpoint /api/auth GET
// ========================

export function requireAuth(cookieValue: string | undefined): boolean {
  return !!cookieValue && cookieValue.length > 10;
}
