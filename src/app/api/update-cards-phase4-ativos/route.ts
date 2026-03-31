import { NextRequest, NextResponse } from "next/server";
import {
  pipefyQuery, fetchAllCardsFromPhase, validateCardId,
  createComment, updateDueDate, getNextBusinessDayAt22,
  formatDateBR, toBrazilDate, requireAuth, PHASE_4_ID, PHASE_5_ID,
} from "@/lib/pipefy";

const PIPE_1_PHASE_9 = "323044836";
const PIPE_1_PHASE_10 = "326702699";
const IMOVEL_ATIVO_TAG = "314317045";

// GET: Lista cards da Fase 4 que tambem existem na Fase 9 ou 10 do Pipe 1
export async function GET(req: NextRequest) {
  if (!requireAuth(req.cookies.get("auth_token")?.value)) {
    return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  }
  try {
    // Buscar todos os cards das fases 9 e 10 do Pipe 1 (para cruzamento por titulo)
    const [phase9Cards, phase10Cards, phase4Cards] = await Promise.all([
      fetchAllCardsFromPhase(PIPE_1_PHASE_9),
      fetchAllCardsFromPhase(PIPE_1_PHASE_10),
      fetchAllCardsFromPhase(PHASE_4_ID),
    ]);

    // Montar set de titulos normalizados das fases 9 e 10
    const ativosTitles = new Set<string>();
    for (const c of [...phase9Cards, ...phase10Cards]) {
      ativosTitles.add(c.title.toUpperCase().trim());
    }

    // Filtrar cards da Fase 4 que existem nas fases 9/10
    const matched = phase4Cards.filter((c: any) =>
      ativosTitles.has(c.title.toUpperCase().trim())
    );

    const cards = matched.map((c: any) => {
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
    });

    return NextResponse.json({ success: true, totalCards: cards.length, cards });
  } catch (err: unknown) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}

// Filtra itens: remove os que começam com ✅ (delimitados por ";")
function filterPendingItems(rawContent: string): string {
  // Juntar tudo em uma string e separar por ";"
  const fullText = rawContent.trim();
  if (!fullText) return "";

  const items = fullText.split(";").map((item) => item.trim()).filter(Boolean);
  const pending = items.filter((item) => !item.startsWith("✅") && !item.startsWith("✔️"));
  if (pending.length === 0) return "";
  return pending.join(";\n") + ";";
}

// Parseia seções do comentário entre emojis
function parseSections(text: string): {
  enxoval: { status: string; content: string; titleLine: string };
  itens: { status: string; content: string };
  manutencao: { status: string; content: string };
} {
  const lines = text.split("\n");

  const findSection = (keyword: string): { status: string; content: string; titleLine: string } => {
    let startIdx = -1;
    let status = "";
    let titleLine = "";
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      if (line.match(new RegExp(`^[❌✔️✅]\\s*${keyword}`, "i"))) {
        startIdx = i;
        status = line.startsWith("❌") ? "❌" : "✔️";
        titleLine = line;
        break;
      }
    }
    if (startIdx === -1) return { status: "", content: "", titleLine: "" };

    // Coletar linhas até o próximo emoji de seção ou fim
    const contentLines: string[] = [];
    for (let i = startIdx + 1; i < lines.length; i++) {
      const line = lines[i].trim();
      if (line.match(/^[❌✔️✅]\s*(ENXOVAL|ITENS|MANUTENÇÃO|MANUTEN|INTERNET|PIN)/i)) break;
      contentLines.push(lines[i]);
    }

    const rawContent = contentLines.join("\n").trim();

    return {
      status,
      content: status === "❌" ? filterPendingItems(rawContent) : "",
      titleLine,
    };
  };

  return {
    enxoval: findSection("ENXOVAL"),
    itens: findSection("ITENS"),
    manutencao: findSection("MANUTEN"),
  };
}

// Monta novo comentario para card ativo
function buildNewComment(oldText: string, newDueDateBR: string): string {
  const newShort = newDueDateBR.slice(0, 5); // DD/MM

  // Encontrar a linha do FUP
  const lines = oldText.split("\n");
  let fupIdx = -1;
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].match(/FUP:?\s*\d{2}[\/\.]\d{2}/i)) {
      fupIdx = i;
      break;
    }
  }

  // Encontrar a linha dos "....." (separador)
  let separatorIdx = -1;
  for (let i = (fupIdx >= 0 ? fupIdx : 0); i < lines.length; i++) {
    if (lines[i].trim().match(/^\.{3,}/)) {
      separatorIdx = i;
      break;
    }
  }

  // Parte abaixo do FUP (a partir dos "....." inclusive)
  const belowFup = separatorIdx >= 0 ? lines.slice(separatorIdx).join("\n") : "";

  // Acima do FUP: novo texto padrao
  const aboveFup = "✅ Imóvel ativo\n\n🚨 Aguardando o envio dos registros pendentes";

  // FUP com nova data
  const fupLine = `⏭️ Fup: ${newShort}`;

  // Montar comentario final
  const parts = [aboveFup, "", fupLine];
  if (belowFup) {
    parts.push(belowFup);
  }

  return parts.join("\n");
}

// POST: Atualiza um card da Fase 4 como ativo
export async function POST(req: NextRequest) {
  if (!requireAuth(req.cookies.get("auth_token")?.value)) {
    return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  }
  try {
    const { cardId, customComment } = await req.json();
    const validId = validateCardId(cardId);

    // 1. Buscar card completo
    const result = await pipefyQuery(`{
      card(id: ${validId}) {
        id title due_date
        labels { id name }
        comments { id text created_at author_name }
      }
    }`);

    const card = result?.data?.card;
    if (!card) return NextResponse.json({ error: "Card não encontrado" }, { status: 404 });

    const actions: string[] = [];
    const comments = card.comments || [];
    const lastComment = comments[0];

    // 2. Calcular nova data (+3 dias uteis a partir de hoje)
    const newDueDate = getNextBusinessDayAt22(3);
    const newDueDateBR = formatDateBR(newDueDate);

    // 3. Determinar o comentário final (editado ou gerado)
    const commentToSend = customComment || (lastComment?.text ? buildNewComment(lastComment.text, newDueDateBR) : null);

    // Parsear seções do comentário NOVO (editado), não do original
    const sections = commentToSend ? parseSections(commentToSend) : null;

    // 4. Adicionar tag "Imóvel Ativo" mantendo as existentes
    const currentLabels = (card.labels || []).map((l: any) => l.id);
    if (!currentLabels.includes(IMOVEL_ATIVO_TAG)) {
      currentLabels.push(IMOVEL_ATIVO_TAG);
    }
    const uniqueLabels = [...new Set(currentLabels)] as string[];
    const labelArray = uniqueLabels.map((id) => `"${id}"`).join(", ");
    await pipefyQuery(`mutation { updateCard(input: { id: ${validId}, label_ids: [${labelArray}] }) { card { id } } }`);
    actions.push("Tag Imóvel Ativo adicionada");

    // 5. Atualizar vencimento +3 dias úteis às 22:00
    await updateDueDate(validId, newDueDate);
    actions.push(`Vencimento → ${newDueDateBR} 22:00`);

    // 6. Adicionar comentário
    if (commentToSend) {
      await createComment(validId, commentToSend);
      actions.push("Comentário adicionado");
    } else {
      actions.push("Sem comentário anterior");
    }

    // 7. Preencher campo obrigatório "Fase 4 - Adequações sinalizadas" → Imóvel ativado
    await pipefyQuery(`mutation { updateCardField(input: { card_id: ${validId}, field_id: "fase_4_adequa_es_sinalizadas", new_value: "Imóvel ativado" }) { success } }`);
    actions.push("Adequações → Imóvel ativado");

    // 8. Mover para Fase 5
    await pipefyQuery(`mutation { moveCardToPhase(input: { card_id: ${validId}, destination_phase_id: ${PHASE_5_ID} }) { card { id } } }`);
    actions.push("Card → Fase 5");

    // 9. Preencher campos (após mover para Fase 5, pois são campos dessa fase)
    if (sections) {
      if (sections.enxoval.status === "❌") {
        const escaped = JSON.stringify(sections.enxoval.titleLine).slice(1, -1);
        await pipefyQuery(`mutation { updateCardField(input: { card_id: ${validId}, field_id: "valida_o_enxoval", new_value: "${escaped}" }) { success } }`);
        actions.push("Campo enxoval: pendente");
      } else if (sections.enxoval.status === "✔️") {
        await pipefyQuery(`mutation { updateCardField(input: { card_id: ${validId}, field_id: "valida_o_enxoval", new_value: "ok" }) { success } }`);
        actions.push("Campo enxoval: ok");
      }

      if (sections.itens.status === "❌") {
        const escaped = JSON.stringify(sections.itens.content).slice(1, -1);
        await pipefyQuery(`mutation { updateCardField(input: { card_id: ${validId}, field_id: "itens_faltantes_atualmente", new_value: "${escaped}" }) { success } }`);
        actions.push("Campo itens: pendentes");
      } else if (sections.itens.status === "✔️") {
        await pipefyQuery(`mutation { updateCardField(input: { card_id: ${validId}, field_id: "itens_faltantes_atualmente", new_value: "ok" }) { success } }`);
        actions.push("Campo itens: ok");
      }

      if (sections.manutencao.status === "❌") {
        const escaped = JSON.stringify(sections.manutencao.content).slice(1, -1);
        await pipefyQuery(`mutation { updateCardField(input: { card_id: ${validId}, field_id: "manuten_es_pendentes_atualmente", new_value: "${escaped}" }) { success } }`);
        actions.push("Campo manutenção: pendentes");
      } else if (sections.manutencao.status === "✔️") {
        await pipefyQuery(`mutation { updateCardField(input: { card_id: ${validId}, field_id: "manuten_es_pendentes_atualmente", new_value: "ok" }) { success } }`);
        actions.push("Campo manutenção: ok");
      }
    }

    return NextResponse.json({
      success: true,
      action: "updated",
      details: actions.join(" | "),
    });
  } catch (err: unknown) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}
