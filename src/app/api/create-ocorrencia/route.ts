import { NextRequest, NextResponse } from "next/server";
import { pipefyQuery, validateCardId, requireAuth } from "@/lib/pipefy";

const OCORRENCIA_PIPE_ID = "306877070";

export async function POST(req: NextRequest) {
  if (!requireAuth(req.cookies.get("auth_token")?.value)) {
    return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  }

  try {
    const { email, envolveimovel, codigo, categoria, franquia, origem, descricao } = await req.json();

    if (!email || !descricao || !origem) {
      return NextResponse.json({ error: "Campos obrigatórios: email, origem, descrição" }, { status: 400 });
    }

    // Sanitizar valores para GraphQL
    const esc = (s: string) => JSON.stringify(s).slice(1, -1);

    const fields = [
      `{ field_id: "e_mail_do_solicitante", field_value: "${esc(email)}" }`,
      `{ field_id: "a_reclama_o_envolve_algum_im_vel_da_seazone", field_value: "${esc(envolveimovel || "Sim")}" }`,
      `{ field_id: "origem_da_ocorr_ncia_1", field_value: "${esc(origem)}" }`,
      `{ field_id: "descreva_o_ocorrido", field_value: "${esc(descricao)}" }`,
    ];

    if (codigo) {
      fields.push(`{ field_id: "c_digo_do_im_vel_1", field_value: "${esc(codigo)}" }`);
    }
    if (categoria) {
      fields.push(`{ field_id: "categoria_da_ocorr_ncia_1", field_value: "${esc(categoria)}" }`);
    }
    if (franquia) {
      fields.push(`{ field_id: "franquia", field_value: "${esc(franquia)}" }`);
    }

    const result = await pipefyQuery(`mutation {
      createCard(input: {
        pipe_id: ${OCORRENCIA_PIPE_ID}
        fields_attributes: [${fields.join(", ")}]
      }) {
        card { id title url }
      }
    }`);

    const card = result?.data?.createCard?.card;
    if (!card) {
      throw new Error("Erro ao criar card");
    }

    return NextResponse.json({
      success: true,
      cardId: card.id,
      title: card.title,
      url: card.url,
    });
  } catch (err: unknown) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}
