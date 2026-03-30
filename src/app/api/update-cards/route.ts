import { NextRequest, NextResponse } from "next/server";

const PIPEFY_API = "https://api.pipefy.com/graphql";
const PIPEFY_TOKEN = process.env.PIPEFY_TOKEN || "";
const PIPE_ID = "303828424";
const PHASE_3_ID = "323529403";
const WESLLEY_USER_ID = "305932218";

async function pipefyQuery(query: string) {
  const res = await fetch(PIPEFY_API, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${PIPEFY_TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ query }),
  });
  return res.json();
}

function getPhase3Id(): string {
  return PHASE_3_ID;
}

// Buscar cards de uma fase com labels, assignees, comments, due_date
async function getPhaseCards(phaseId: string, cursor?: string): Promise<{ cards: any[]; hasNext: boolean; endCursor: string | null }> {
  const afterClause = cursor ? `, after: "${cursor}"` : "";
  const result = await pipefyQuery(`{
    phase(id: ${phaseId}) {
      cards(first: 50${afterClause}) {
        edges {
          node {
            id
            title
            due_date
            labels { id name }
            assignees { id name email }
            comments { id text created_at author_name }
          }
        }
        pageInfo {
          hasNextPage
          endCursor
        }
      }
    }
  }`);

  const data = result?.data?.phase?.cards;
  const edges = data?.edges || [];
  const cards = edges.map((e: any) => e.node);
  return {
    cards,
    hasNext: data?.pageInfo?.hasNextPage || false,
    endCursor: data?.pageInfo?.endCursor || null,
  };
}

// Buscar TODOS os cards da fase (paginação completa)
async function getAllPhaseCards(phaseId: string): Promise<any[]> {
  let allCards: any[] = [];
  let cursor: string | undefined;
  let hasNext = true;

  while (hasNext) {
    const result = await getPhaseCards(phaseId, cursor);
    allCards = [...allCards, ...result.cards];
    hasNext = result.hasNext;
    cursor = result.endCursor || undefined;
  }

  return allCards;
}

function getWeslleyId(): string {
  return WESLLEY_USER_ID;
}

// Atualizar vencimento do card
async function updateDueDate(cardId: string, dueDate: string) {
  const result = await pipefyQuery(`mutation {
    updateCard(input: { id: ${cardId}, due_date: "${dueDate}" }) {
      card { id due_date }
    }
  }`);
  return result;
}

// Atualizar responsável do card
async function updateAssignee(cardId: string, userId: string) {
  const result = await pipefyQuery(`mutation {
    updateCard(input: { id: ${cardId}, assignee_ids: ["${userId}"] }) {
      card { id assignees { id name } }
    }
  }`);
  return result;
}

// Criar comentário no card
async function createComment(cardId: string, text: string) {
  const escapedText = text.replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/\n/g, "\\n");
  const result = await pipefyQuery(`mutation {
    createComment(input: { card_id: ${cardId}, text: "${escapedText}" }) {
      comment { id text }
    }
  }`);
  return result;
}

// Tags que devem ser ignoradas
const SKIP_TAGS = [
  "ADEQUAÇÃO COMPLEXA",
  "REVISÃO DE PENDÊNCIAS FINALIZADA",
  "REVISÃO DE PENDENCIAS FINALIZADA",
  "REVISÃO DE PENDENCIAS FINALIZADAS",
  "REVISÃO DE PENDÊNCIAS FINALIZADAS",
];

// Pegar data em horário de Brasília (UTC-3)
function toBrazilDate(date: Date): { day: number; month: number; year: number } {
  // Converter para string no fuso de Brasília
  const br = date.toLocaleString("en-US", { timeZone: "America/Sao_Paulo" });
  const d = new Date(br);
  return { day: d.getDate(), month: d.getMonth(), year: d.getFullYear() };
}

function shouldSkipCard(card: any): { skip: boolean; reason: string } {
  const labels = card.labels || [];
  const hasSkipTag = labels.some((label: any) => {
    const name = label.name?.toUpperCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "") || "";
    return SKIP_TAGS.some((tag) => {
      const normalizedTag = tag.toUpperCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
      return name.includes(normalizedTag);
    });
  });
  if (hasSkipTag) {
    const tagNames = labels.map((l: any) => l.name).join(", ");
    return { skip: true, reason: `Tag: ${tagNames}` };
  }

  // Só atualizar cards com vencimento para hoje (horário de Brasília)
  if (!card.due_date) {
    return { skip: true, reason: "Sem vencimento definido" };
  }
  const dueDate = toBrazilDate(new Date(card.due_date));
  const today = toBrazilDate(new Date());
  const isDueToday =
    dueDate.year === today.year &&
    dueDate.month === today.month &&
    dueDate.day === today.day;

  if (!isDueToday) {
    const dd = String(dueDate.day).padStart(2, "0");
    const mm = String(dueDate.month + 1).padStart(2, "0");
    return { skip: true, reason: `Vencimento em ${dd}/${mm} (não é hoje)` };
  }

  return { skip: false, reason: "" };
}

function getNextBusinessDayAt22(): string {
  // Calcular "amanhã" em horário de Brasília
  const nowBR = new Date(new Date().toLocaleString("en-US", { timeZone: "America/Sao_Paulo" }));
  nowBR.setDate(nowBR.getDate() + 1);
  // Se sábado (6), pula para segunda (+2). Se domingo (0), pula para segunda (+1).
  const day = nowBR.getDay();
  if (day === 6) nowBR.setDate(nowBR.getDate() + 2);
  if (day === 0) nowBR.setDate(nowBR.getDate() + 1);
  // Retornar no formato ISO com fuso de Brasília
  const yyyy = nowBR.getFullYear();
  const mm = String(nowBR.getMonth() + 1).padStart(2, "0");
  const dd = String(nowBR.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}T22:00:00-03:00`;
}

function formatDateBR(isoDate: string): string {
  const d = new Date(isoDate);
  const br = toBrazilDate(d);
  const day = String(br.day).padStart(2, "0");
  const month = String(br.month + 1).padStart(2, "0");
  return `${day}/${month}/${br.year}`;
}

// Processar um único card
async function processCard(card: any, weslleyId: string | null): Promise<{
  cardId: string;
  title: string;
  action: "skipped" | "updated" | "error";
  details: string;
}> {
  try {
    // Verificar tags
    const skipCheck = shouldSkipCard(card);
    if (skipCheck.skip) {
      return { cardId: card.id, title: card.title, action: "skipped", details: skipCheck.reason };
    }

    const newDueDate = getNextBusinessDayAt22();
    const newDueDateBR = formatDateBR(newDueDate);
    const actions: string[] = [];

    // 1. Atualizar vencimento para amanhã às 22:00
    await updateDueDate(card.id, newDueDate);
    actions.push(`Vencimento → ${newDueDateBR} 22:00`);

    // 2. Atualizar responsável se necessário
    const assignees = card.assignees || [];
    const isWeslleyAssigned = assignees.some((a: any) =>
      a.name?.toLowerCase().includes("weslley") || a.email?.toLowerCase().includes("weslley")
    );

    if (!isWeslleyAssigned && weslleyId) {
      await updateAssignee(card.id, weslleyId);
      actions.push("Responsável → Weslley Bertoldo");
    } else if (isWeslleyAssigned) {
      actions.push("Responsável mantido (Weslley)");
    }

    // 3. Pegar último comentário (mais recente) e replicar com nova data de vencimento
    const comments = card.comments || [];
    const lastComment = comments.length > 0 ? comments[0] : null;
    if (lastComment?.text) {
      const newDueDateShort = newDueDateBR.slice(0, 5); // "DD/MM"
      // Substituir a data no campo "Fup" ou "FUP" (com ou sem ":", com espaço)
      // Formatos: "Fup: 30/03", "FUP 30.03.", "Fup: 30/03/2026", "FUP 30.03"
      const newCommentText = lastComment.text.replace(
        /(FUP:?\s*)(\d{2})[\/.](\d{2})(?:[\/.](\d{4}))?(\.)?/gi,
        (_match: string, prefix: string, _day: string, _month: string, year: string, trailingDot: string) => {
          const dot = trailingDot || "";
          if (year) return `${prefix}${newDueDateBR}${dot}`;
          return `${prefix}${newDueDateShort}${dot}`;
        }
      );
      await createComment(card.id, newCommentText);
      actions.push("Comentário adicionado");
    } else {
      actions.push("Sem comentário anterior");
    }

    return { cardId: card.id, title: card.title, action: "updated", details: actions.join(" | ") };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return { cardId: card.id, title: card.title, action: "error", details: message };
  }
}

// ===== ROTA: Listar cards da Fase 3 (GET) =====
export async function GET() {
  if (!PIPEFY_TOKEN) {
    return NextResponse.json({ error: "PIPEFY_TOKEN não configurado" }, { status: 500 });
  }

  try {
    const phaseId = getPhase3Id();

    const cards = await getAllPhaseCards(phaseId);
    const cardsWithoutSkipTags = cards.filter((c) => !shouldSkipCard(c).skip);
    const cardsWithSkipTags = cards.filter((c) => shouldSkipCard(c).skip);

    return NextResponse.json({
      success: true,
      phaseId,
      totalCards: cards.length,
      toUpdate: cardsWithoutSkipTags.length,
      toSkip: cardsWithSkipTags.length,
      cards: cards.map((c) => ({
        id: c.id,
        title: c.title,
        labels: (c.labels || []).map((l: any) => l.name),
        skip: shouldSkipCard(c).skip,
        skipReason: shouldSkipCard(c).reason,
        assignees: (c.assignees || []).map((a: any) => a.name),
        due_date: c.due_date,
      })),
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// ===== ROTA: Processar um card (POST) =====
export async function POST(req: NextRequest) {
  if (!PIPEFY_TOKEN) {
    return NextResponse.json({ error: "PIPEFY_TOKEN não configurado" }, { status: 500 });
  }

  try {
    const { cardId } = await req.json();

    if (!cardId) {
      return NextResponse.json({ error: "cardId obrigatório" }, { status: 400 });
    }

    const weslleyId = getWeslleyId();

    // Buscar card individual
    const result = await pipefyQuery(`{
      card(id: ${cardId}) {
        id
        title
        due_date
        labels { id name }
        assignees { id name email }
        comments { id text created_at author_name }
      }
    }`);

    const card = result?.data?.card;
    if (!card) {
      return NextResponse.json({ error: "Card não encontrado" }, { status: 404 });
    }

    const processResult = await processCard(card, weslleyId);
    return NextResponse.json({ success: true, ...processResult });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
