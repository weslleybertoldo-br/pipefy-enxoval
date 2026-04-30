import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/pipefy";
import { getSuporteCard, updateSuporteCard } from "@/lib/suporte-ops";

const SAPRON_API_KEY = "85Rjs5I1QCLQRlWfncYkBbFOeYOn5iXiczeKMfcswao";
const SAPRON_BASE_URL = "https://api.sapron.com.br";

// Deduz "Status do imóvel" via Sapron:
//  - Active   → "Ativo"
//  - Outros   → "Implantação" (imóvel existe na base mas não está ativo)
//  - Ausente  → "" (não preenche)
async function deduzirStatusImovel(
  codigoAntigo: string,
  codigoNovo: string
): Promise<string> {
  try {
    const r = await fetch(`${SAPRON_BASE_URL}/properties/properties_list/`, {
      headers: { "X-SAPRON-API-KEY": SAPRON_API_KEY },
    });
    if (!r.ok) return "";
    const props: Array<{ code: string; status: string }> = await r.json();
    const upAntigo = codigoAntigo.toUpperCase();
    const upNovo = codigoNovo.toUpperCase();
    // Prefere o código novo (estado pós-troca); fallback antigo.
    const match =
      props.find((p) => p.code.toUpperCase() === upNovo) ||
      props.find((p) => p.code.toUpperCase() === upAntigo);
    if (!match) return "";
    if (match.status === "Active") return "Ativo";
    return "Implantação";
  } catch (err) {
    console.error("[suporte-mover-card] sapron falhou:", err);
    return "";
  }
}

interface MoverFlags {
  planilha?: boolean; // Alterado na base de código
  sapron?: boolean; // Alterado no Sapron
  pipefy?: boolean; // Alterado no Pipefy
  stays?: boolean; // Alterado na Stays
  precoMinimo?: "sim" | "nao" | null; // O imóvel tem preço mínimo?
}

export async function POST(request: NextRequest) {
  const authToken = request.cookies.get("auth_token")?.value;
  if (!requireAuth(authToken)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await request.json().catch(() => ({}));
    const cardSuporteId = String(body.cardSuporteId || "").trim();
    const codigoAntigo = String(body.codigoAntigo || "").trim();
    const codigoNovo = String(body.codigoNovo || "").trim();
    const flags = (body.flags || {}) as MoverFlags;
    const dryRun = Boolean(body.dryRun);

    if (!cardSuporteId) {
      return NextResponse.json(
        { error: "cardSuporteId obrigatório" },
        { status: 400 }
      );
    }

    // 1) Buscar card atual pra fazer merge no campos_preenchidos
    const atual = await getSuporteCard(cardSuporteId);
    if (!atual) {
      return NextResponse.json(
        { error: `Card ${cardSuporteId} não encontrado no suporte-ops` },
        { status: 404 }
      );
    }

    // 2) Deduzir Status do imóvel via Sapron
    const statusImovel = await deduzirStatusImovel(codigoAntigo, codigoNovo);

    // 3) Montar campos da fase em_andamento
    // O campo "Preço Mínimo" só preenche quando tivermos resposta concreta
    // (sim/não); se "pendente"/null, deixa o existente intacto pra evitar sobrescrita.
    const novoEmAndamento: Record<string, any> = {
      "Status do imóvel": statusImovel,
      "Alterado na base de código": !!flags.planilha,
      "Alterado no Sapron": !!flags.sapron,
      "Alterado no Pipefy": !!flags.pipefy,
      "Alterado na Stays": !!flags.stays,
    };
    if (flags.precoMinimo === "sim") {
      novoEmAndamento["O imóvel tem preço mínimo?"] = "Sim";
    } else if (flags.precoMinimo === "nao") {
      novoEmAndamento["O imóvel tem preço mínimo?"] = "Não";
    }

    const camposPreenchidosAtuais =
      (atual.campos_preenchidos as Record<string, any>) || {};
    const emAndamentoAtual =
      (camposPreenchidosAtuais.em_andamento as Record<string, any>) || {};

    const camposPreenchidosNovos = {
      ...camposPreenchidosAtuais,
      em_andamento: { ...emAndamentoAtual, ...novoEmAndamento },
    };

    // Resumo legível pra mensagem
    const resumoCampos = Object.entries(novoEmAndamento)
      .filter(([k]) => k !== "Status do imóvel")
      .map(([k, v]) => `${k}: ${v === true ? "✓" : v === false ? "—" : v}`)
      .join(", ");

    // 4) Se dryRun, retorna o que SERIA aplicado sem PATCH
    if (dryRun) {
      return NextResponse.json({
        success: true,
        dryRun: true,
        cardSuporteId,
        statusAtual: atual.status,
        statusImovel,
        camposAplicados: novoEmAndamento,
        camposAtuais: emAndamentoAtual,
        novoStatus: "aguardando",
        mensagem: `Preview — Status: ${statusImovel || "(vazio)"}, ${resumoCampos}.`,
      });
    }

    // 5) PATCH: campos_preenchidos + status="aguardando"
    const updated = await updateSuporteCard(cardSuporteId, {
      campos_preenchidos: camposPreenchidosNovos,
      status: "aguardando",
    } as any);

    return NextResponse.json({
      success: true,
      dryRun: false,
      cardSuporteId,
      statusImovel,
      camposAplicados: novoEmAndamento,
      novoStatus: "aguardando",
      mensagem: `Card movido para "Aguardando" — Status: ${statusImovel || "(vazio)"}, ${resumoCampos}.`,
      cardAtualizado: { id: updated?.id, status: updated?.status },
    });
  } catch (error: any) {
    console.error("Erro em suporte-mover-card:", error);
    return NextResponse.json(
      { error: error.message || "Erro ao mover card" },
      { status: 500 }
    );
  }
}
