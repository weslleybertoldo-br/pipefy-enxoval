import { NextRequest, NextResponse } from "next/server";
import {
  pipefyQuery, searchCardInPhase, updateDueDate, createComment,
  validateCardId, toBrazilDate, formatDateBR, isDueToday, getNextBusinessDayAt22,
  replaceCommentFupDate, requireAuth, PHASE_5_ID, PIPE_1_PHASES,
} from "@/lib/pipefy";

async function getOwnerInfo(code: string): Promise<{ nome: string; telefone: string; email: string }> {
  const empty = { nome: "", telefone: "", email: "" };
  try {
    for (const phaseId of PIPE_1_PHASES) {
      const result = await pipefyQuery(`{
        phase(id: ${phaseId}) {
          cards(first: 3, search: { title: "${JSON.stringify(code).slice(1, -1)}" }) {
            edges {
              node {
                title
                fields { name value }
              }
            }
          }
        }
      }`);
      const edges = result?.data?.phase?.cards?.edges || [];
      const card = edges.find((e: any) => e.node.title.toUpperCase() === code.toUpperCase());
      if (card) {
        const fields = card.node.fields || [];
        const nome = fields.find((f: any) => f.name?.toLowerCase().includes("nome do proprietário"))?.value || "";
        const telefone = fields.find((f: any) => f.name?.toLowerCase().includes("telefone do proprietário"))?.value || "";
        const email = fields.find((f: any) => f.name?.toLowerCase().includes("e-mail do proprietário") || f.name?.toLowerCase().includes("email do proprietário"))?.value || "";
        if (nome || telefone || email) return { nome, telefone, email };
      }
    }
  } catch { /* silencioso */ }
  return empty;
}

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
      const formatted = formatPhase5Card(card);
      const owner = await getOwnerInfo(card.title);
      return NextResponse.json({ success: true, totalCards: 1, cards: [{ ...formatted, owner }] });
    }

    const allCards = await fetchPhase5Cards();
    const cards = allCards.filter((c) => c.due_date && isDueToday(c.due_date));
    const formatted = cards.map(formatPhase5Card);

    // Buscar dados do proprietário em paralelo (batch de 5)
    const owners: Record<string, { nome: string; telefone: string; email: string }> = {};
    for (let i = 0; i < formatted.length; i += 5) {
      const batch = formatted.slice(i, i + 5);
      const results = await Promise.all(batch.map((c) => getOwnerInfo(c.title)));
      batch.forEach((c, idx) => { owners[c.id] = results[idx]; });
    }

    return NextResponse.json({
      success: true,
      totalCards: formatted.length,
      cards: formatted.map((c) => ({ ...c, owner: owners[c.id] || { nome: "", telefone: "", email: "" } })),
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

    const newDueDate = getNextBusinessDayAt22(3);
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
