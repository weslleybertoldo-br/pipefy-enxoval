import { NextRequest, NextResponse } from "next/server";
import { pipefyQuery, validateCardId, createComment, updateDueDate, getNextBusinessDayAt22, formatDateBR, toBrazilDate, requireAuth, PHASE_5_ID, PIPE_1_PHASES } from "@/lib/pipefy";


async function buscarFranquiaPipe1(code: string): Promise<string | null> {
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
      const field = (card.node.fields || []).find((f: any) => f.name?.toLowerCase() === "anfitrião escolhido");
      if (field?.value) return field.value;
    }
  }
  return null;
}

const CONCLUDED_PHASE_ID = "323315793";
const SLACK_TOKEN = process.env.SLACK_BOT_TOKEN || "";
const SLACK_CHANNEL_ID = "C09CQRNEVLZ";
const BRUNO_SLACK_ID = "U05AKADK9EY";
const WESLLEY_SLACK_ID = "U08DF2E4RLP";

// Tags de enxoval/itens/manutenção
const TAG_COMPRAR_ENXOVAL = "310425316";
const TAG_ENTREGAR_ENXOVAL = "310938829";
const TAG_VALIDAR_ENXOVAL = "310959732";
const TAG_ITENS_PEQUENOS = "310938809";
const TAG_ITENS_GRANDES = "310425321";
const TAG_MANUT_PEQUENAS = "310938821";
const TAG_MANUT_GRANDES = "310425328";

// Detecta status de uma seção no comentário (❌ ou ✔️)
function getSectionStatus(text: string, keyword: string): "❌" | "✔️" | "" {
  const lines = text.split("\n");
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.match(new RegExp(`^[❌✔✅]`, "i")) && trimmed.toUpperCase().includes(keyword.toUpperCase())) {
      return trimmed.startsWith("❌") ? "❌" : "✔️";
    }
  }
  return "";
}

// Extrair status do enxoval do comentário
function getEnxovalFromComment(text: string): string {
  const lines = text.split("\n");
  for (const line of lines) {
    const trimmed = line.trim();
    if (/^[❌✔✅]/.test(trimmed) && trimmed.toUpperCase().includes("ENXOVAL")) {
      return trimmed;
    }
  }
  return "ok";
}

// Verificar se marca do enxoval é Matinali (COMPRADO PP CSO ou MATINALI)
function isMatinali(enxovalLine: string): boolean {
  const upper = enxovalLine.toUpperCase();
  return (upper.includes("COMPRADO") && upper.includes("PP CSO")) || upper.includes("MATINALI");
}

// POST: Atualizar comentário editado
export async function POST(req: NextRequest) {
  if (!requireAuth(req.cookies.get("auth_token")?.value)) {
    return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  }
  try {
    const { cardId, action, commentText, amenitesOption } = await req.json();
    const validId = validateCardId(cardId);

    if (action === "update_comment") {
      if (!commentText) return NextResponse.json({ error: "Comentário obrigatório" }, { status: 400 });
      await createComment(validId, commentText);
      return NextResponse.json({ success: true, details: "Comentário atualizado" });
    }

    if (action === "finalizar") {
      // Buscar card com comentários e campos
      const result = await pipefyQuery(`{
        card(id: ${validId}) {
          id title
          current_phase { id }
          labels { id }
          comments { id text }
          fields { name value }
        }
      }`);

      const card = result?.data?.card;
      if (!card) return NextResponse.json({ error: "Card não encontrado" }, { status: 404 });

      const lastComment = (card.comments || [])[0]?.text || "";
      const enxovalLine = getEnxovalFromComment(lastComment);
      const isEnxovalMatinali = isMatinali(enxovalLine);
      const actions: string[] = [];
      const errors: string[] = [];

      // Helper: executar ação com tratamento de erro individual
      async function step(name: string, fn: () => Promise<void>) {
        try { await fn(); actions.push(name); } catch (e: unknown) { errors.push(`${name}: ${e instanceof Error ? e.message : "erro"}`); }
      }

      // 1. Validação Enxoval
      let enxovalValue = "ok";
      if (enxovalLine.startsWith("❌")) enxovalValue = enxovalLine;
      await step(`Validação Enxoval → ${enxovalValue}`, () =>
        pipefyQuery(`mutation { updateCardField(input: { card_id: ${validId}, field_id: "valida_o_enxoval", new_value: "${JSON.stringify(enxovalValue).slice(1, -1)}" }) { success } }`)
      );

      // 2-3. Itens faltantes e Manutenções → ok
      await step("Itens faltantes → ok", () =>
        pipefyQuery(`mutation { updateCardField(input: { card_id: ${validId}, field_id: "itens_faltantes_atualmente", new_value: "ok" }) { success } }`)
      );
      await step("Manutenções → ok", () =>
        pipefyQuery(`mutation { updateCardField(input: { card_id: ${validId}, field_id: "manuten_es_pendentes_atualmente", new_value: "ok" }) { success } }`)
      );

      // 4. Adequações sinalizadas
      await step("Adequações → Todas finalizadas", () =>
        pipefyQuery(`mutation { updateCardField(input: { card_id: ${validId}, field_id: "fase_5_adequa_es_sinalizadas", new_value: "Todas adequações finalizadas" }) { success } }`)
      );

      // 5. Marca do enxoval
      const marcaValue = isEnxovalMatinali ? "Matinali" : "-";
      await step(`Marca enxoval → ${marcaValue}`, () =>
        pipefyQuery(`mutation { updateCardField(input: { card_id: ${validId}, field_id: "valida_o_da_marca_do_enxoval", new_value: "${marcaValue}" }) { success } }`)
      );

      // 6. Registro de enxoval
      const enxovalField = (card.fields || []).find((f: any) => f.name?.toLowerCase().includes("registro de enxoval"));
      const hasRecord = enxovalField?.value && enxovalField.value !== "[]" && enxovalField.value !== "";
      if (!hasRecord) {
        await step("Registro enxoval", async () => {
          const processRes = await fetch(`${process.env.NEXT_PUBLIC_BASE_URL || "https://pipefy-enxoval-git-master-weslleybertoldo-brs-projects.vercel.app"}/api/process-card`, {
            method: "POST", headers: { "Content-Type": "application/json", Cookie: `auth_token=${req.cookies.get("auth_token")?.value}` }, body: JSON.stringify({ code: card.title }),
          });
          const processData = await processRes.json();
          if (!processData.success) throw new Error(processData.error || "erro");
        });
      } else {
        actions.push("Registro enxoval já existe");
      }

      // 7-9. Vistoria
      await step("Vistoria → Atualização solicitada", () =>
        pipefyQuery(`mutation { updateCardField(input: { card_id: ${validId}, field_id: "solicitar_a_atualiza_o_do_relat_rio_de_vistoria", new_value: "Atualização solicitada" }) { success } }`)
      );
      await step("SAPRON → Vistoria inserida", () =>
        pipefyQuery(`mutation { updateCardField(input: { card_id: ${validId}, field_id: "subir_a_vistoria_para_o_sapron", new_value: "Vistoria inserida" }) { success } }`)
      );
      await step("Vistoria → Enviada proprietário", () =>
        pipefyQuery(`mutation { updateCardField(input: { card_id: ${validId}, field_id: "enviar_a_vistoria_para_o_propriet_rio_com_a_franquia_em_c_pia", new_value: "Vistoria enviada" }) { success } }`)
      );

      // 10. Amenites
      const amenitesValue = amenitesOption || "Verificado + avisado anúncios";
      await step(`Amenites → ${amenitesValue}`, () =>
        pipefyQuery(`mutation { updateCardField(input: { card_id: ${validId}, field_id: "verificar_o_an_ncio_se_as_amenites_est_o_conformes", new_value: "${JSON.stringify(amenitesValue).slice(1, -1)}" }) { success } }`)
      );

      // 11. Aviso despesa
      await step("Despesa → Fluxo aberto", () =>
        pipefyQuery(`mutation { updateCardField(input: { card_id: ${validId}, field_id: "aviso_no_canal_para_lan_amento_de_despesa", new_value: "Sim, fluxo aberto" }) { success } }`)
      );

      // 12. Atualizar tags baseado no comentário + adicionar tags de finalização
      const TAGS_TO_ADD = ["315963981", "316723774"]; // Atualizar laudo vistoria + Solicitado lançamento de despesa
      let tagLabels = (card.labels || []).map((l: any) => l.id) as string[];

      // Sempre remover Itens/Manut grandes
      tagLabels = tagLabels.filter((id: string) => id !== TAG_ITENS_GRANDES && id !== TAG_MANUT_GRANDES);

      // Baseado no comentário: ✔️ remove tags, ❌ mantém
      const enxovalStatus = getSectionStatus(lastComment, "ENXOVAL");
      const itensStatus = getSectionStatus(lastComment, "ITENS");
      const manutStatus = getSectionStatus(lastComment, "MANUTEN");

      if (enxovalStatus && enxovalStatus !== "❌") {
        tagLabels = tagLabels.filter((id) => id !== TAG_COMPRAR_ENXOVAL && id !== TAG_ENTREGAR_ENXOVAL && id !== TAG_VALIDAR_ENXOVAL);
      }
      if (itensStatus && itensStatus !== "❌") {
        tagLabels = tagLabels.filter((id) => id !== TAG_ITENS_PEQUENOS);
      }
      if (manutStatus && manutStatus !== "❌") {
        tagLabels = tagLabels.filter((id) => id !== TAG_MANUT_PEQUENAS);
      }

      // Adicionar tags de finalização
      for (const tagId of TAGS_TO_ADD) {
        if (!tagLabels.includes(tagId)) tagLabels.push(tagId);
      }

      const uniqueLabels = [...new Set(tagLabels)];
      await step("Tags atualizadas", () => {
        const labelArray = uniqueLabels.map((id: string) => `"${id}"`).join(", ");
        return pipefyQuery(`mutation { updateCard(input: { id: ${validId}, label_ids: [${labelArray}] }) { card { id } } }`);
      });

      // 13. Vencimento
      const newDueDate = getNextBusinessDayAt22(1);
      await step(`Vencimento → ${formatDateBR(newDueDate)} 22:00`, () => updateDueDate(validId, newDueDate));

      // 14. Mover para Concluídos
      await step("Card → Concluídos", () =>
        pipefyQuery(`mutation { moveCardToPhase(input: { card_id: ${validId}, destination_phase_id: ${CONCLUDED_PHASE_ID} }) { card { id } } }`)
      );

      // 15. Aviso de lançamento de despesa no Slack (chamada direta, sem HTTP)
      await step("Aviso despesa Slack", async () => {
        if (!SLACK_TOKEN) throw new Error("SLACK_BOT_TOKEN não configurado");
        const franquia = await buscarFranquiaPipe1(card.title);
        if (!franquia) {
          throw new Error("Franquia não encontrada nas fases 1-10 do Pipe 1 — aviso não enviado");
        }
        const hojeBR = toBrazilDate(new Date());
        const dataFormatada = `${String(hojeBR.day).padStart(2, "0")}/${String(hojeBR.month + 1).padStart(2, "0")}/${hojeBR.year}`;

        const blocks = [
          {
            type: "section",
            text: {
              type: "mrkdwn",
              text: `<@${BRUNO_SLACK_ID}>, o imóvel *${card.title}* está liberado para lançamento de despesa.\n\n*Franquia responsável:* ${franquia}\n*Data que deve ser lançado:* ${dataFormatada}\n\nApós o lançamento, o card pode ser finalizado no pipe 1 :a-parrot:`,
            },
          },
          {
            type: "actions",
            elements: [
              {
                type: "button",
                text: { type: "plain_text", text: "Despesa lançada", emoji: true },
                style: "primary",
                action_id: "despesa_lancada",
                value: WESLLEY_SLACK_ID,
              },
            ],
          },
        ];

        const res = await fetch("https://slack.com/api/chat.postMessage", {
          method: "POST",
          headers: { Authorization: `Bearer ${SLACK_TOKEN}`, "Content-Type": "application/json" },
          body: JSON.stringify({ channel: SLACK_CHANNEL_ID, text: `Lançamento de despesa - ${card.title}`, blocks }),
        });
        const slackResult = await res.json();
        if (!slackResult.ok) throw new Error(`Slack: ${slackResult.error}`);
      });

      const allDetails = [...actions, ...errors.map((e) => `❌ ${e}`)].join(" | ");
      return NextResponse.json({ success: errors.length === 0, details: allDetails });
    }

    return NextResponse.json({ error: "Ação inválida" }, { status: 400 });
  } catch (err: unknown) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}
