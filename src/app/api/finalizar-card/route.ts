import { NextRequest, NextResponse } from "next/server";
import { pipefyQuery, validateCardId, createComment, updateDueDate, getNextBusinessDayAt22, formatDateBR, requireAuth, PHASE_5_ID } from "@/lib/pipefy";

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

      // 1. Validação Enxoval
      let enxovalValue = "ok";
      if (enxovalLine.startsWith("✔️")) {
        enxovalValue = "ok";
      } else if (enxovalLine.startsWith("❌")) {
        enxovalValue = enxovalLine;
      }
      await pipefyQuery(`mutation {
        updateCardField(input: { card_id: ${validId}, field_id: "valida_o_enxoval", new_value: "${enxovalValue.replace(/"/g, '\\"')}" }) { success }
      }`);
      actions.push(`Validação Enxoval → ${enxovalValue}`);

      // 2. Itens faltantes atualmente → ok
      await pipefyQuery(`mutation {
        updateCardField(input: { card_id: ${validId}, field_id: "itens_faltantes_atualmente", new_value: "ok" }) { success }
      }`);
      actions.push("Itens faltantes → ok");

      // 3. Manutenções pendentes atualmente → ok
      await pipefyQuery(`mutation {
        updateCardField(input: { card_id: ${validId}, field_id: "manuten_es_pendentes_atualmente", new_value: "ok" }) { success }
      }`);
      actions.push("Manutenções → ok");

      // 4. Fase 5 - Adequações sinalizadas → Todas adequações finalizadas
      await pipefyQuery(`mutation {
        updateCardField(input: { card_id: ${validId}, field_id: "fase_5_adequa_es_sinalizadas", new_value: "Todas adequações finalizadas" }) { success }
      }`);
      actions.push("Adequações sinalizadas → Todas finalizadas");

      // 5. Validação da marca do enxoval
      let marcaValue = "-";
      if (isCompradoPPCSO) {
        marcaValue = "Matinali";
      }
      await pipefyQuery(`mutation {
        updateCardField(input: { card_id: ${validId}, field_id: "valida_o_da_marca_do_enxoval", new_value: "${marcaValue}" }) { success }
      }`);
      actions.push(`Marca enxoval → ${marcaValue}`);

      // 6. Gerar registro de enxoval se não existir
      const enxovalField = (card.fields || []).find((f: any) =>
        f.name?.toLowerCase().includes("registro de enxoval")
      );
      const hasRecord = enxovalField?.value && enxovalField.value !== "[]" && enxovalField.value !== "";
      if (!hasRecord) {
        // Chamar a API de processamento de enxoval
        try {
          const processRes = await fetch(`${process.env.NEXT_PUBLIC_BASE_URL || "https://pipefy-enxoval-git-master-weslleybertoldo-brs-projects.vercel.app"}/api/process-card`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ code: card.title }),
          });
          const processData = await processRes.json();
          if (processData.success) {
            actions.push(`Registro enxoval criado #${processData.recordId}`);
          } else {
            actions.push(`Registro enxoval: ${processData.error || "erro"}`);
          }
        } catch {
          actions.push("Registro enxoval: erro ao processar");
        }
      } else {
        actions.push("Registro enxoval já existe");
      }

      // 7. Solicitar atualização do relatório de Vistoria
      await pipefyQuery(`mutation {
        updateCardField(input: { card_id: ${validId}, field_id: "solicitar_a_atualiza_o_do_relat_rio_de_vistoria", new_value: "Atualização solicitada" }) { success }
      }`);
      actions.push("Vistoria → Atualização solicitada");

      // 8. Subir vistoria para SAPRON
      await pipefyQuery(`mutation {
        updateCardField(input: { card_id: ${validId}, field_id: "subir_a_vistoria_para_o_sapron", new_value: "Vistoria inserida" }) { success }
      }`);
      actions.push("SAPRON → Vistoria inserida");

      // 9. Enviar vistoria para proprietário
      await pipefyQuery(`mutation {
        updateCardField(input: { card_id: ${validId}, field_id: "enviar_a_vistoria_para_o_propriet_rio_com_a_franquia_em_c_pia", new_value: "Vistoria enviada" }) { success }
      }`);
      actions.push("Vistoria → Enviada proprietário");

      // 10. Verificar amenites
      const amenitesValue = amenitesOption || "Verificado + avisado anúncios";
      await pipefyQuery(`mutation {
        updateCardField(input: { card_id: ${validId}, field_id: "verificar_o_an_ncio_se_as_amenites_est_o_conformes", new_value: "${amenitesValue}" }) { success }
      }`);
      actions.push(`Amenites → ${amenitesValue}`);

      // 11. Aviso despesa
      await pipefyQuery(`mutation {
        updateCardField(input: { card_id: ${validId}, field_id: "aviso_no_canal_para_lan_amento_de_despesa", new_value: "Sim, fluxo aberto" }) { success }
      }`);
      actions.push("Despesa → Fluxo aberto");

      // 12. Atualizar vencimento para próximo dia útil 22:00
      const newDueDate = getNextBusinessDayAt22(1);
      await updateDueDate(validId, newDueDate);
      actions.push(`Vencimento → ${formatDateBR(newDueDate)} 22:00`);

      // 13. Mover para Concluídos
      await pipefyQuery(`mutation {
        moveCardToPhase(input: { card_id: ${validId}, destination_phase_id: ${CONCLUDED_PHASE_ID} }) {
          card { id current_phase { name } }
        }
      }`);
      actions.push("Card → Concluídos");

      return NextResponse.json({ success: true, details: actions.join(" | ") });
    }

    return NextResponse.json({ error: "Ação inválida" }, { status: 400 });
  } catch (err: unknown) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}
