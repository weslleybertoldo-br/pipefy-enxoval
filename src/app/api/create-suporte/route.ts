import { NextRequest, NextResponse } from "next/server";
import { pipefyQuery, requireAuth } from "@/lib/pipefy";

const SUPORTE_PIPE_ID = "306389053";

export async function POST(req: NextRequest) {
  if (!requireAuth(req.cookies.get("auth_token")?.value)) {
    return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  }

  try {
    const { email, codigo, categoria, setor, descricao, franqueado } = await req.json();

    if (!email || !codigo || !descricao) {
      return NextResponse.json({ error: "Campos obrigatórios: email, código, descrição" }, { status: 400 });
    }

    const esc = (s: string) => JSON.stringify(s).slice(1, -1);

    const fields = [
      `{ field_id: "e_mail_solicitante", field_value: "${esc(email)}" }`,
      `{ field_id: "c_digo_do_im_vel", field_value: "${esc(codigo)}" }`,
      `{ field_id: "descri_o_do_problema", field_value: "${esc(descricao)}" }`,
    ];

    if (categoria) fields.push(`{ field_id: "categoria_da_solicita_o", field_value: "${esc(categoria)}" }`);
    if (setor) fields.push(`{ field_id: "setor_solicitante", field_value: "${esc(setor)}" }`);
    if (franqueado) fields.push(`{ field_id: "franqueado", field_value: "${esc(franqueado)}" }`);

    const result = await pipefyQuery(`mutation {
      createCard(input: {
        pipe_id: ${SUPORTE_PIPE_ID}
        fields_attributes: [${fields.join(", ")}]
      }) {
        card { id title url }
      }
    }`);

    const card = result?.data?.createCard?.card;
    if (!card) throw new Error("Erro ao criar card");

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
