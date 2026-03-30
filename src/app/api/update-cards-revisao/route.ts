import { NextRequest, NextResponse } from "next/server";
import {
  pipefyQuery, fetchAllCardsFromPhase, updateDueDate, createComment,
  validateCardId, toBrazilDate, formatDateBR, isDueToday, getNextBusinessDayAt22,
  replaceCommentFupDate, requireAuth, PHASE_3_ID,
} from "@/lib/pipefy";

function normalize(str: string): string {
  return str.toUpperCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

function hasTag(card: any, tagSearch: string): boolean {
  return (card.labels || []).some((l: any) => normalize(l.name || "").includes(normalize(tagSearch)));
}

function classifyCard(card: any): "complexa" | "revisao" | "none" {
  const isComplexa = hasTag(card, "ADEQUACAO COMPLEXA");
  const isRevisaoFinalizada = hasTag(card, "REVISAO DE PENDENCIAS FINALIZADA");

  if (isComplexa) return "complexa";
  if (isRevisaoFinalizada && !isComplexa) return "revisao";
  return "none";
}

// GET: Listar cards da Fase 3 separados por tipo
export async function GET(req: NextRequest) {
  if (!requireAuth(req.cookies.get("auth_token")?.value)) {
    return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  }
  try {
    const cards = await fetchAllCardsFromPhase(PHASE_3_ID);

    // Filtrar só cards com vencimento para hoje
    const todayCards = cards.filter((c) => c.due_date && isDueToday(c.due_date));

    const result = todayCards.map((c) => {
      const lastComment = (c.comments || [])[0];
      const br = toBrazilDate(new Date(c.due_date));
      const dueFormatted = `${String(br.day).padStart(2, "0")}/${String(br.month + 1).padStart(2, "0")}/${br.year}`;
      return {
        id: c.id,
        title: c.title,
        type: classifyCard(c),
        due_date: c.due_date,
        dueFormatted,
        assignees: (c.assignees || []).map((a: any) => a.name),
        labels: (c.labels || []).map((l: any) => l.name),
        lastComment: lastComment?.text || "",
        lastCommentAuthor: lastComment?.author_name || "",
        lastCommentDate: lastComment?.created_at || "",
      };
    });

    const complexa = result.filter((r) => r.type === "complexa");
    const revisao = result.filter((r) => r.type === "revisao");

    return NextResponse.json({
      success: true,
      totalCards: cards.length,
      complexaCount: complexa.length,
      revisaoCount: revisao.length,
      cards: result,
    });
  } catch (err: unknown) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}

// POST: Atualizar card (complexa: +1 dia útil com FUP | revisao: +2 dias úteis com comentário customizado)
export async function POST(req: NextRequest) {
  if (!requireAuth(req.cookies.get("auth_token")?.value)) {
    return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  }
  try {
    const { cardId, type, customComment } = await req.json();
    const validId = validateCardId(cardId);

    if (type === "complexa") {
      // +1 dia útil, replica último comentário com FUP atualizado
      const newDueDate = getNextBusinessDayAt22(1);
      const newDueDateBR = formatDateBR(newDueDate);
      const actions: string[] = [];

      await updateDueDate(validId, newDueDate);
      actions.push(`Vencimento → ${newDueDateBR} 22:00`);

      // Buscar card para pegar último comentário
      const result = await pipefyQuery(`{
        card(id: ${validId}) { id title comments { id text } }
      }`);
      const card = result?.data?.card;
      const comments = card?.comments || [];
      const lastComment = comments[0];

      if (lastComment?.text) {
        const newText = replaceCommentFupDate(lastComment.text, newDueDateBR);
        await createComment(validId, newText);
        actions.push("Comentário adicionado");
      }

      return NextResponse.json({ success: true, action: "updated", details: actions.join(" | ") });
    }

    if (type === "revisao") {
      // +2 dias úteis, comentário customizado
      const newDueDate = getNextBusinessDayAt22(2);
      const newDueDateBR = formatDateBR(newDueDate);
      const actions: string[] = [];

      await updateDueDate(validId, newDueDate);
      actions.push(`Vencimento → ${newDueDateBR} 22:00`);

      if (customComment) {
        await createComment(validId, customComment);
        actions.push("Comentário customizado adicionado");
      }

      return NextResponse.json({ success: true, action: "updated", details: actions.join(" | ") });
    }

    return NextResponse.json({ error: "Tipo inválido" }, { status: 400 });
  } catch (err: unknown) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}
