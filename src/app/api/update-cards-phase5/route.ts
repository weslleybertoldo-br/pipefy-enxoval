import { NextRequest, NextResponse } from "next/server";

const PIPEFY_API = "https://api.pipefy.com/graphql";
const PIPEFY_TOKEN = process.env.PIPEFY_TOKEN || "";
const PHASE_5_ID = "333848127";

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

function toBrazilDate(date: Date): { day: number; month: number; year: number; dayOfWeek: number } {
  const br = date.toLocaleString("en-US", { timeZone: "America/Sao_Paulo" });
  const d = new Date(br);
  return { day: d.getDate(), month: d.getMonth(), year: d.getFullYear(), dayOfWeek: d.getDay() };
}

// +3 dias úteis a partir da data de vencimento do card, às 22:00 BRT
function getBusinessDayPlus3FromDate(dueDateStr: string): string {
  const dueDate = new Date(new Date(dueDateStr).toLocaleString("en-US", { timeZone: "America/Sao_Paulo" }));
  let businessDays = 0;
  const next = new Date(dueDate);

  while (businessDays < 3) {
    next.setDate(next.getDate() + 1);
    const dow = next.getDay();
    if (dow !== 0 && dow !== 6) businessDays++;
  }

  const yyyy = next.getFullYear();
  const mm = String(next.getMonth() + 1).padStart(2, "0");
  const dd = String(next.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}T22:00:00-03:00`;
}

function formatDateBR(isoDate: string): string {
  const d = toBrazilDate(new Date(isoDate));
  const day = String(d.day).padStart(2, "0");
  const month = String(d.month + 1).padStart(2, "0");
  return `${day}/${month}/${d.year}`;
}

// Buscar todos os cards da Fase 5
async function getAllPhaseCards(cursor?: string): Promise<{ cards: any[]; hasNext: boolean; endCursor: string | null }> {
  const afterClause = cursor ? `, after: "${cursor}"` : "";
  const result = await pipefyQuery(`{
    phase(id: ${PHASE_5_ID}) {
      cards(first: 50${afterClause}) {
        edges {
          node {
            id
            title
            due_date
            labels { id name }
            assignees { id name }
            comments { id text created_at author_name }
          }
        }
        pageInfo { hasNextPage endCursor }
      }
    }
  }`);

  const data = result?.data?.phase?.cards;
  const edges = data?.edges || [];
  return {
    cards: edges.map((e: any) => e.node),
    hasNext: data?.pageInfo?.hasNextPage || false,
    endCursor: data?.pageInfo?.endCursor || null,
  };
}

async function fetchAllCards(): Promise<any[]> {
  let allCards: any[] = [];
  let cursor: string | undefined;
  let hasNext = true;
  while (hasNext) {
    const result = await getAllPhaseCards(cursor);
    allCards = [...allCards, ...result.cards];
    hasNext = result.hasNext;
    cursor = result.endCursor || undefined;
  }
  return allCards;
}

async function updateDueDate(cardId: string, dueDate: string) {
  return pipefyQuery(`mutation {
    updateCard(input: { id: ${cardId}, due_date: "${dueDate}" }) {
      card { id due_date }
    }
  }`);
}

async function createComment(cardId: string, text: string) {
  const escapedText = text.replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/\n/g, "\\n");
  return pipefyQuery(`mutation {
    createComment(input: { card_id: ${cardId}, text: "${escapedText}" }) {
      comment { id text }
    }
  }`);
}

// GET: Listar todos os cards da Fase 5 com último comentário
export async function GET() {
  if (!PIPEFY_TOKEN) {
    return NextResponse.json({ error: "PIPEFY_TOKEN não configurado" }, { status: 500 });
  }
  try {
    const cards = await fetchAllCards();

    return NextResponse.json({
      success: true,
      totalCards: cards.length,
      cards: cards.map((c) => {
        const lastComment = (c.comments || [])[0];
        const br = c.due_date ? toBrazilDate(new Date(c.due_date)) : null;
        const dueFormatted = br
          ? `${String(br.day).padStart(2, "0")}/${String(br.month + 1).padStart(2, "0")}/${br.year}`
          : "Sem vencimento";
        return {
          id: c.id,
          title: c.title,
          due_date: c.due_date,
          dueFormatted,
          assignees: (c.assignees || []).map((a: any) => a.name),
          labels: (c.labels || []).map((l: any) => l.name),
          lastComment: lastComment?.text || "",
          lastCommentAuthor: lastComment?.author_name || "",
          lastCommentDate: lastComment?.created_at || "",
        };
      }),
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// POST: Atualizar um card específico (+3 dias úteis, comentário com nova data)
export async function POST(req: NextRequest) {
  if (!PIPEFY_TOKEN) {
    return NextResponse.json({ error: "PIPEFY_TOKEN não configurado" }, { status: 500 });
  }
  try {
    const { cardId } = await req.json();
    if (!cardId) return NextResponse.json({ error: "cardId obrigatório" }, { status: 400 });

    // Buscar card
    const result = await pipefyQuery(`{
      card(id: ${cardId}) {
        id title due_date
        comments { id text created_at author_name }
      }
    }`);

    const card = result?.data?.card;
    if (!card) return NextResponse.json({ error: "Card não encontrado" }, { status: 404 });

    // Calcular nova data: +3 dias úteis a partir do vencimento atual (ou de hoje se sem vencimento)
    const baseDate = card.due_date || new Date().toISOString();
    const newDueDate = getBusinessDayPlus3FromDate(baseDate);
    const newDueDateBR = formatDateBR(newDueDate);
    const newDueDateShort = newDueDateBR.slice(0, 5);
    const actions: string[] = [];

    // 1. Atualizar vencimento
    await updateDueDate(card.id, newDueDate);
    actions.push(`Vencimento → ${newDueDateBR} 22:00`);

    // 2. Replicar último comentário com nova data no FUP
    const comments = card.comments || [];
    const lastComment = comments.length > 0 ? comments[0] : null;
    if (lastComment?.text) {
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

    return NextResponse.json({
      success: true,
      cardId: card.id,
      title: card.title,
      action: "updated",
      details: actions.join(" | "),
      newDueDate: newDueDateBR,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
