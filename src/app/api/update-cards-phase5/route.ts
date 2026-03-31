import { NextRequest, NextResponse } from "next/server";
import {
  pipefyQuery, searchCardInPhase, updateDueDate, createComment,
  validateCardId, toBrazilDate, formatDateBR, isDueToday, getNextBusinessDayAt22,
  replaceCommentFupDate, requireAuth, PHASE_5_ID,
} from "@/lib/pipefy";

// Buscar cards da Fase 5 com fields (para registro de enxoval)
async function fetchPhase5Cards(): Promise<any[]> {
  let allCards: any[] = [];
  let cursor: string | undefined;
  let pages = 0;
  while (pages < 50) {
    const afterClause = cursor ? `, after: "${cursor}"` : "";
    const result = await pipefyQuery(`{
      phase(id: ${PHASE_5_ID}) {
        cards(first: 50${afterClause}) {
          edges {
            node {
              id title due_date
              labels { id name }
              assignees { id name }
              comments { id text created_at author_name }
              fields {
                name value
                connected_repo_items { ... on TableRecord { id title } ... on Card { id title } }
              }
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

export async function GET(req: NextRequest) {
  if (!requireAuth(req.cookies.get("auth_token")?.value)) {
    return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  }
  try {
    const search = req.nextUrl.searchParams.get("search");

    const formatPhase5Card = (c: any) => {
      const lastComment = (c.comments || [])[0];
      const br = c.due_date ? toBrazilDate(new Date(c.due_date)) : null;
      const dueFormatted = br ? `${String(br.day).padStart(2, "0")}/${String(br.month + 1).padStart(2, "0")}/${br.year}` : "Sem vencimento";
      const enxovalField = (c.fields || []).find((f: any) => f.name?.toLowerCase().includes("registro de enxoval"));
      const connectedItems = enxovalField?.connected_repo_items || [];
      const hasRecord = connectedItems.length > 0 && !!connectedItems[0]?.id;
      const recordId = hasRecord ? connectedItems[0].id : "";
      return {
        id: c.id, title: c.title, due_date: c.due_date, dueFormatted,
        assignees: (c.assignees || []).map((a: any) => a.name),
        labels: (c.labels || []).map((l: any) => l.name),
        lastComment: lastComment?.text || "", lastCommentAuthor: lastComment?.author_name || "", lastCommentDate: lastComment?.created_at || "",
        hasRecord, recordId,
      };
    };

    if (search) {
      const card = await searchCardInPhase(PHASE_5_ID, search);
      if (!card) return NextResponse.json({ success: true, totalCards: 0, cards: [] });
      return NextResponse.json({ success: true, totalCards: 1, cards: [formatPhase5Card(card)] });
    }

    const allCards = await fetchPhase5Cards();
    const cards = allCards.filter((c) => c.due_date && isDueToday(c.due_date));

    return NextResponse.json({
      success: true,
      totalCards: cards.length,
      cards: cards.map(formatPhase5Card),
    });
  } catch (err: unknown) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  if (!requireAuth(req.cookies.get("auth_token")?.value)) {
    return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  }
  try {
    const { cardId } = await req.json();
    const validId = validateCardId(cardId);

    const result = await pipefyQuery(`{
      card(id: ${validId}) {
        id title due_date
        current_phase { id }
        comments { id text created_at author_name }
      }
    }`);

    const card = result?.data?.card;
    if (!card) return NextResponse.json({ error: "Card não encontrado" }, { status: 404 });

    // Validar que o card pertence à Fase 5
    if (String(card.current_phase?.id) !== PHASE_5_ID) {
      return NextResponse.json({ error: "Card não pertence à Fase 5" }, { status: 400 });
    }

    const baseDate = card.due_date || new Date().toISOString();
    const newDueDate = getNextBusinessDayAt22(3, baseDate);
    const newDueDateBR = formatDateBR(newDueDate);
    const actions: string[] = [];

    await updateDueDate(card.id, newDueDate);
    actions.push(`Vencimento → ${newDueDateBR} 22:00`);

    const comments = card.comments || [];
    const lastComment = comments[0];
    if (lastComment?.text) {
      const newText = replaceCommentFupDate(lastComment.text, newDueDateBR);
      await createComment(card.id, newText);
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
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}
