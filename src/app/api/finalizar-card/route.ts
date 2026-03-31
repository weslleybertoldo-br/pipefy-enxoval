import { NextRequest, NextResponse } from "next/server";
import { pipefyQuery, validateCardId, createComment, updateDueDate, getNextBusinessDayAt22, formatDateBR, requireAuth, PHASE_5_ID } from "@/lib/pipefy";

// Pipe 1 - fases 1 a 10 (exclui Fase 11 para evitar duplicatas)
const PIPE_1_PHASES = [
  "323044780",  // Backlog
  "333371452",  // Fase 0
  "323044781",  // Fase 1
  "323044783",  // Fase 2
  "323044784",  // Fase 3
  "323044785",  // Fase 4
  "323044786",  // Fase 5
  "323044787",  // Fase 6
  "323044796",  // Fase 7
  "323044844",  // Fase 8
  "323044836",  // Fase 9
  "326702699",  // Fase 10
];

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

// Extrair status do enxoval do comentário
function getEnxovalFromComment(text: string): string {
  const lines = text.split("\n");
  for (const line of lines) {
    const trimmed = line.trim();
    if (/^[✔️❌]\s*ENXOVAL/i.test(trimmed)) {
      return trimmed;
    }
  }
  return "ok";
}

// Verificar se tem "COMPRADO - PP CSO" no enxoval
function hasCompradoPPCSO(enxovalLine: string): boolean {
  return enxovalLine.toUpperCase().includes("COMPRADO - PP CSO");
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
          comments { id text }
          fields { name value }
        }
      }`);

      const card = result?.data?.card;
      if (!card) return NextResponse.json({ error: "Card não encontrado" }, { status: 404 });

      const lastComment = (card.comments || [])[0]?.text || "";
      const enxovalLine = getEnxovalFromComment(lastComment);
      const isCompradoPPCSO = hasCompradoPPCSO(enxovalLine);
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
        pipefyQuery(`mutation { updateCardField(input: { card_id: ${validId}, field_id: "valida_o_enxoval", new_value: "${enxovalValue.replace(/"/g, '\\"')}" }) { success } }`)
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
      const marcaValue = isCompradoPPCSO ? "Matinali" : "-";
      await step(`Marca enxoval → ${marcaValue}`, () =>
        pipefyQuery(`mutation { updateCardField(input: { card_id: ${validId}, field_id: "valida_o_da_marca_do_enxoval", new_value: "${marcaValue}" }) { success } }`)
      );

      // 6. Registro de enxoval
      const enxovalField = (card.fields || []).find((f: any) => f.name?.toLowerCase().includes("registro de enxoval"));
      const hasRecord = enxovalField?.value && enxovalField.value !== "[]" && enxovalField.value !== "";
      if (!hasRecord) {
        await step("Registro enxoval", async () => {
          const processRes = await fetch(`${process.env.NEXT_PUBLIC_BASE_URL || "https://pipefy-enxoval-git-master-weslleybertoldo-brs-projects.vercel.app"}/api/process-card`, {
            method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ code: card.title }),
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
        pipefyQuery(`mutation { updateCardField(input: { card_id: ${validId}, field_id: "verificar_o_an_ncio_se_as_amenites_est_o_conformes", new_value: "${amenitesValue}" }) { success } }`)
      );

      // 11. Aviso despesa
      await step("Despesa → Fluxo aberto", () =>
        pipefyQuery(`mutation { updateCardField(input: { card_id: ${validId}, field_id: "aviso_no_canal_para_lan_amento_de_despesa", new_value: "Sim, fluxo aberto" }) { success } }`)
      );

      // 12. Remover tags
      const TAGS_TO_REMOVE = ["310938809", "310938821", "310425321", "310425328"];
      const currentLabels = (card.labels || []).map((l: any) => l.id);
      const filteredLabels = currentLabels.filter((id: string) => !TAGS_TO_REMOVE.includes(id));
      if (filteredLabels.length !== currentLabels.length) {
        await step("Tags removidas", () => {
          const labelArray = filteredLabels.map((id: string) => `"${id}"`).join(", ");
          return pipefyQuery(`mutation { updateCard(input: { id: ${validId}, label_ids: [${labelArray}] }) { card { id } } }`);
        });
      }

      // 13. Vencimento
      const newDueDate = getNextBusinessDayAt22(1);
      await step(`Vencimento → ${formatDateBR(newDueDate)} 22:00`, () => updateDueDate(validId, newDueDate));

      // 14. Mover para Concluídos
      await step("Card → Concluídos", () =>
        pipefyQuery(`mutation { moveCardToPhase(input: { card_id: ${validId}, destination_phase_id: ${CONCLUDED_PHASE_ID} }) { card { id } } }`)
      );

      // 15. Aviso de lançamento de despesa no Slack
      await step("Aviso despesa Slack", async () => {
        const franquia = await buscarFranquiaPipe1(card.title);
        if (!franquia) {
          throw new Error("Franquia não encontrada nas fases 1-10 do Pipe 1 — aviso não enviado");
        }
        const hoje = new Date();
        const dd = String(hoje.getDate()).padStart(2, "0");
        const mm = String(hoje.getMonth() + 1).padStart(2, "0");
        const yyyy = hoje.getFullYear();
        const dataHoje = `${yyyy}-${mm}-${dd}`;

        const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || "https://pipefy-enxoval-git-master-weslleybertoldo-brs-projects.vercel.app";
        const slackRes = await fetch(`${baseUrl}/api/slack-despesa`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Cookie: `auth_token=${req.cookies.get("auth_token")?.value}` },
          body: JSON.stringify({ codigo: card.title, franquia, data: dataHoje }),
        });
        const slackData = await slackRes.json();
        if (!slackData.success) throw new Error(slackData.error || "Erro ao enviar Slack");
      });

      const allDetails = [...actions, ...errors.map((e) => `❌ ${e}`)].join(" | ");
      return NextResponse.json({ success: errors.length === 0, details: allDetails });
    }

    return NextResponse.json({ error: "Ação inválida" }, { status: 400 });
  } catch (err: unknown) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}
