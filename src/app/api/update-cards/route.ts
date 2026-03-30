import { NextRequest, NextResponse } from "next/server";

const PIPEFY_API = "https://api.pipefy.com/graphql";
const PIPEFY_TOKEN = process.env.PIPEFY_TOKEN || "";
const PIPE_ID = "303828424";

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

// Descobrir o ID da Fase 3 dinamicamente
async function getPhase3Id(): Promise<string | null> {
  const result = await pipefyQuery(`{
    pipe(id: ${PIPE_ID}) {
      phases { id name }
    }
  }`);
  const phases = result?.data?.pipe?.phases;
  if (!phases || phases.length < 3) return null;
  // Fase 3 = terceira fase na lista
  return phases[2]?.id || null;
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
            comments(first: 1) {
              edges {
                node {
                  id
                  text
                  created_at
                  author_name
                }
              }
            }
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

// Buscar o ID do usuário "Weslley Bertoldo" no pipe
async function getWeslleyId(): Promise<string | null> {
  const result = await pipefyQuery(`{
    pipe(id: ${PIPE_ID}) {
      members { user { id name email } }
    }
  }`);
  const members = result?.data?.pipe?.members || [];
  const weslley = members.find((m: any) =>
    m.user?.name?.toLowerCase().includes("weslley") ||
    m.user?.email?.toLowerCase().includes("weslley")
  );
  return weslley?.user?.id || null;
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
  "REVISÃO DE PENDENCIAS FINALIZADAS",
];

function shouldSkipCard(card: any): { skip: boolean; reason: string } {
  const labels = card.labels || [];
  const hasSkipTag = labels.some((label: any) =>
    SKIP_TAGS.some((tag) => label.name?.toUpperCase().includes(tag.toUpperCase()))
  );
  if (hasSkipTag) {
    const tagNames = labels.map((l: any) => l.name).join(", ");
    return { skip: true, reason: `Tag: ${tagNames}` };
  }

  // Só atualizar cards com vencimento para hoje
  if (!card.due_date) {
    return { skip: true, reason: "Sem vencimento definido" };
  }
  const dueDate = new Date(card.due_date);
  const today = new Date();
  const isDueToday =
    dueDate.getFullYear() === today.getFullYear() &&
    dueDate.getMonth() === today.getMonth() &&
    dueDate.getDate() === today.getDate();

  if (!isDueToday) {
    const dd = String(dueDate.getDate()).padStart(2, "0");
    const mm = String(dueDate.getMonth() + 1).padStart(2, "0");
    return { skip: true, reason: `Vencimento em ${dd}/${mm} (não é hoje)` };
  }

  return { skip: false, reason: "" };
}

function getNextBusinessDayAt22(): string {
  const next = new Date();
  next.setDate(next.getDate() + 1);
  // Se sábado (6), pula para segunda (+2). Se domingo (0), pula para segunda (+1).
  const day = next.getDay();
  if (day === 6) next.setDate(next.getDate() + 2); // sábado → segunda
  if (day === 0) next.setDate(next.getDate() + 1); // domingo → segunda
  next.setHours(22, 0, 0, 0);
  return next.toISOString();
}

function formatDateBR(isoDate: string): string {
  const d = new Date(isoDate);
  const day = String(d.getDate()).padStart(2, "0");
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const year = d.getFullYear();
  return `${day}/${month}/${year}`;
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

    // 3. Pegar último comentário e adicionar com nova data
    const lastComment = card.comments?.edges?.[0]?.node;
    if (lastComment?.text) {
      // Substituir datas no formato DD/MM/YYYY no texto do comentário pela nova data
      let newCommentText = lastComment.text.replace(
        /\d{2}\/\d{2}\/\d{4}/g,
        newDueDateBR
      );
      // Se não tinha data no comentário, adicionar no início
      if (newCommentText === lastComment.text) {
        newCommentText = `[Vencimento: ${newDueDateBR}] ${lastComment.text}`;
      }
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
    const phaseId = await getPhase3Id();
    if (!phaseId) {
      return NextResponse.json({ error: "Fase 3 não encontrada no pipe" }, { status: 404 });
    }

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

    const weslleyId = await getWeslleyId();

    // Buscar card individual
    const result = await pipefyQuery(`{
      card(id: ${cardId}) {
        id
        title
        due_date
        labels { id name }
        assignees { id name email }
        comments(first: 1) {
          edges {
            node { id text created_at author_name }
          }
        }
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
