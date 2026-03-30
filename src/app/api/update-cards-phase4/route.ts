import { NextRequest, NextResponse } from "next/server";

const PIPEFY_API = "https://api.pipefy.com/graphql";
const PIPEFY_TOKEN = process.env.PIPEFY_TOKEN || "";
const PHASE_4_ID = "333848207";

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

// Fuso horário de Brasília
function toBrazilDate(date: Date): { day: number; month: number; year: number; dayOfWeek: number } {
  const br = date.toLocaleString("en-US", { timeZone: "America/Sao_Paulo" });
  const d = new Date(br);
  return { day: d.getDate(), month: d.getMonth(), year: d.getFullYear(), dayOfWeek: d.getDay() };
}

function isDueToday(dueDateStr: string): boolean {
  const dueDate = toBrazilDate(new Date(dueDateStr));
  const today = toBrazilDate(new Date());
  return dueDate.year === today.year && dueDate.month === today.month && dueDate.day === today.day;
}

// +2 dias úteis a partir de hoje, às 22:00 BRT
function getBusinessDayPlus2At22(): string {
  const nowBR = new Date(new Date().toLocaleString("en-US", { timeZone: "America/Sao_Paulo" }));
  let businessDays = 0;
  const next = new Date(nowBR);

  while (businessDays < 2) {
    next.setDate(next.getDate() + 1);
    const dow = next.getDay();
    if (dow !== 0 && dow !== 6) businessDays++; // pula sábado e domingo
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

// Buscar todos os cards da Fase 4
async function getAllPhaseCards(cursor?: string): Promise<{ cards: any[]; hasNext: boolean; endCursor: string | null }> {
  const afterClause = cursor ? `, after: "${cursor}"` : "";
  const result = await pipefyQuery(`{
    phase(id: ${PHASE_4_ID}) {
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

// Atualizar vencimento
async function updateDueDate(cardId: string, dueDate: string) {
  return pipefyQuery(`mutation {
    updateCard(input: { id: ${cardId}, due_date: "${dueDate}" }) {
      card { id due_date }
    }
  }`);
}

// Criar comentário
async function createComment(cardId: string, text: string) {
  const escapedText = text.replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/\n/g, "\\n");
  return pipefyQuery(`mutation {
    createComment(input: { card_id: ${cardId}, text: "${escapedText}" }) {
      comment { id text }
    }
  }`);
}

// Processar um card
async function processCard(card: any): Promise<{
  cardId: string; title: string; action: "skipped" | "updated" | "error"; details: string;
}> {
  try {
    // Só atualiza cards do Weslley Bertoldo
    const assignees = card.assignees || [];
    const isWeslley = assignees.some((a: any) =>
      a.name?.toLowerCase().includes("weslley") || a.id === "305932218"
    );
    if (!isWeslley) {
      const responsavel = assignees.map((a: any) => a.name).join(", ") || "Sem responsável";
      return { cardId: card.id, title: card.title, action: "skipped", details: `Responsável: ${responsavel} (não é Weslley)` };
    }

    if (!card.due_date || !isDueToday(card.due_date)) {
      const br = card.due_date ? toBrazilDate(new Date(card.due_date)) : null;
      const reason = br
        ? `Vencimento em ${String(br.day).padStart(2, "0")}/${String(br.month + 1).padStart(2, "0")} (não é hoje)`
        : "Sem vencimento definido";
      return { cardId: card.id, title: card.title, action: "skipped", details: reason };
    }

    const newDueDate = getBusinessDayPlus2At22();
    const newDueDateBR = formatDateBR(newDueDate);
    const newDueDateShort = newDueDateBR.slice(0, 5);
    const actions: string[] = [];

    // 1. Atualizar vencimento (+2 dias úteis às 22:00)
    await updateDueDate(card.id, newDueDate);
    actions.push(`Vencimento → ${newDueDateBR} 22:00`);

    // 2. Replicar último comentário com nova data
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

    return { cardId: card.id, title: card.title, action: "updated", details: actions.join(" | ") };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return { cardId: card.id, title: card.title, action: "error", details: message };
  }
}

// GET: Listar cards da Fase 4
export async function GET() {
  if (!PIPEFY_TOKEN) {
    return NextResponse.json({ error: "PIPEFY_TOKEN não configurado" }, { status: 500 });
  }
  try {
    const cards = await fetchAllCards();

    function getSkipInfo(c: any): { skip: boolean; reason: string } {
      const isWeslley = (c.assignees || []).some((a: any) =>
        a.name?.toLowerCase().includes("weslley") || a.id === "305932218"
      );
      if (!isWeslley) {
        const resp = (c.assignees || []).map((a: any) => a.name).join(", ") || "Sem responsável";
        return { skip: true, reason: `Responsável: ${resp} (não é Weslley)` };
      }
      if (!c.due_date) return { skip: true, reason: "Sem vencimento" };
      if (!isDueToday(c.due_date)) {
        const br = toBrazilDate(new Date(c.due_date));
        return { skip: true, reason: `Vencimento em ${String(br.day).padStart(2, "0")}/${String(br.month + 1).padStart(2, "0")}` };
      }
      return { skip: false, reason: "" };
    }

    const toUpdate = cards.filter((c) => !getSkipInfo(c).skip);
    const toSkip = cards.filter((c) => getSkipInfo(c).skip);

    return NextResponse.json({
      success: true,
      totalCards: cards.length,
      toUpdate: toUpdate.length,
      toSkip: toSkip.length,
      cards: cards.map((c) => {
        const info = getSkipInfo(c);
        return {
          id: c.id,
          title: c.title,
          labels: (c.labels || []).map((l: any) => l.name),
          assignees: (c.assignees || []).map((a: any) => a.name),
          due_date: c.due_date,
          skip: info.skip,
          skipReason: info.reason,
        };
      }),
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// POST: Processar um card
export async function POST(req: NextRequest) {
  if (!PIPEFY_TOKEN) {
    return NextResponse.json({ error: "PIPEFY_TOKEN não configurado" }, { status: 500 });
  }
  try {
    const { cardId } = await req.json();
    if (!cardId) return NextResponse.json({ error: "cardId obrigatório" }, { status: 400 });

    const result = await pipefyQuery(`{
      card(id: ${cardId}) {
        id title due_date
        labels { id name }
        assignees { id name }
        comments { id text created_at author_name }
      }
    }`);

    const card = result?.data?.card;
    if (!card) return NextResponse.json({ error: "Card não encontrado" }, { status: 404 });

    const processResult = await processCard(card);
    return NextResponse.json({ success: true, ...processResult });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
