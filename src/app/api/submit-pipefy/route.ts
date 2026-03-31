import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/pipefy";

const PIPEFY_API = "https://api.pipefy.com/graphql";
const PIPEFY_TOKEN = process.env.PIPEFY_TOKEN || "";
const TABLE_ID = "uPKa2zs_";
const ORG_ID = "330500";

interface EnxovalData {
  codigo_imovel: string;
  fronha: number;
  toalha_de_banho: number;
  toalha_de_rosto: number;
  toalha_de_piso: number;
  toalha_de_maquiagem: number;
  toalha_de_praia: number;
  manta_queen_size: number;
  lencol_ou_virol_solteiro: number;
  lencol_ou_virol_casal: number;
  lencol_ou_virol_queen_size: number;
  lencol_ou_virol_king_size: number;
  edredom_solteiro: number;
  edredom_casal: number;
  edredom_queen_size: number;
  edredom_king_size: number;
  capa_edredom_solteiro: number;
  capa_edredom_casal: number;
  capa_edredom_queen_size: number;
  capa_edredom_king_size: number;
}

async function pipefyQuery(query: string) {
  const res = await fetch(PIPEFY_API, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${PIPEFY_TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ query }),
  });
  return res.json();
}

async function uploadFileToPipefy(file: File): Promise<string> {
  // Step 1: Get presigned URL
  const presignQuery = `
    mutation {
      createPresignedUrl(input: {
        organizationId: "${ORG_ID}"
        fileName: "${file.name.replace(/"/g, '\\"')}"
      }) {
        clientMutationId
        url
      }
    }
  `;

  const presignResult = await pipefyQuery(presignQuery);
  const presignedUrl = presignResult.data?.createPresignedUrl?.url;

  if (!presignedUrl) {
    throw new Error("Falha ao obter URL de upload: " + JSON.stringify(presignResult));
  }

  // Step 2: Upload file to S3 via presigned URL
  const buffer = Buffer.from(await file.arrayBuffer());
  const uploadRes = await fetch(presignedUrl, {
    method: "PUT",
    body: buffer,
  });

  if (!uploadRes.ok) {
    throw new Error(`Falha no upload: ${uploadRes.status} ${uploadRes.statusText}`);
  }

  // Step 3: Extract path after hostname (orgs/ORG_UUID/uploads/FILE_UUID/filename.pdf)
  const fullUrl = presignedUrl.split("?")[0];
  const pathMatch = fullUrl.match(/\.amazonaws\.com\/(.+)$/);
  if (!pathMatch) {
    throw new Error("URL de upload inválida: " + fullUrl);
  }
  return pathMatch[1];
}

function getTodayFormatted(): string {
  const now = new Date();
  const day = String(now.getDate()).padStart(2, "0");
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const year = now.getFullYear();
  return `${day}/${month}/${year}`;
}

export async function POST(request: NextRequest) {
  if (!requireAuth(request.cookies.get("auth_token")?.value)) {
    return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  }
  try {
    if (!PIPEFY_TOKEN) {
      return NextResponse.json(
        { error: "Token do Pipefy não configurado no servidor" },
        { status: 500 }
      );
    }

    const formData = await request.formData();
    const dataStr = formData.get("data") as string;
    const pdfFile = formData.get("pdf") as File;
    const cardId = formData.get("cardId") as string;

    if (!dataStr) {
      return NextResponse.json(
        { error: "Dados não fornecidos" },
        { status: 400 }
      );
    }

    const data: EnxovalData = JSON.parse(dataStr);

    // Step 1: Upload PDF first (required field)
    let fileUrl = "";
    if (pdfFile && pdfFile.size > 0) {
      try {
        fileUrl = await uploadFileToPipefy(pdfFile);
      } catch (err) {
        return NextResponse.json(
          { error: "Falha no upload do PDF: " + String(err) },
          { status: 500 }
        );
      }
    }

    if (!fileUrl) {
      return NextResponse.json(
        { error: "PDF é obrigatório para criar o registro (campo Comprovante de compra)" },
        { status: 400 }
      );
    }

    // Step 2: Create table record with all fields including attachment
    const fields = [
      { field_id: "c_digo_do_im_vel", field_value: data.codigo_imovel },
      { field_id: "data_de_compra_do_enxoval", field_value: getTodayFormatted() },
      { field_id: "fronha", field_value: String(data.fronha) },
      { field_id: "toalha_de_banho", field_value: String(data.toalha_de_banho) },
      { field_id: "toalha_de_rosto", field_value: String(data.toalha_de_rosto) },
      { field_id: "toalha_de_piso", field_value: String(data.toalha_de_piso) },
      { field_id: "toalha_de_maquiagem", field_value: String(data.toalha_de_maquiagem) },
      { field_id: "toalha_de_praia", field_value: String(data.toalha_de_praia) },
      { field_id: "manta_queen_size", field_value: String(data.manta_queen_size) },
      { field_id: "lencol_ou_virol_solteiro", field_value: String(data.lencol_ou_virol_solteiro) },
      { field_id: "len_ol_ou_virol_casal", field_value: String(data.lencol_ou_virol_casal) },
      { field_id: "len_ol_ou_virol_queen_size", field_value: String(data.lencol_ou_virol_queen_size) },
      { field_id: "len_ol_ou_virol_king_size", field_value: String(data.lencol_ou_virol_king_size) },
      { field_id: "edredom_solteiro", field_value: String(data.edredom_solteiro) },
      { field_id: "edredom_casal", field_value: String(data.edredom_casal) },
      { field_id: "edredom_queen_size", field_value: String(data.edredom_queen_size) },
      { field_id: "edredom_king_size", field_value: String(data.edredom_king_size) },
      { field_id: "capa_edredom_solteiro", field_value: String(data.capa_edredom_solteiro) },
      { field_id: "capa_edredom_casal", field_value: String(data.capa_edredom_casal) },
      { field_id: "capa_edredom_queen_size", field_value: String(data.capa_edredom_queen_size) },
      { field_id: "capa_edredom_king_size", field_value: String(data.capa_edredom_king_size) },
      { field_id: "valida_o_da_marca_do_enxoval", field_value: "0" },
      { field_id: "comprovante_de_compra_do_propriet_rio", field_value: fileUrl },
    ];

    const fieldsStr = fields
      .map((f) => `{ field_id: "${f.field_id}", field_value: ${JSON.stringify(f.field_value)} }`)
      .join(", ");

    const createQuery = `
      mutation {
        createTableRecord(input: {
          table_id: "${TABLE_ID}"
          fields_attributes: [${fieldsStr}]
        }) {
          table_record { id title }
        }
      }
    `;

    const createResult = await pipefyQuery(createQuery);

    if (createResult.errors) {
      return NextResponse.json(
        { error: "Erro ao criar registro", details: createResult.errors },
        { status: 500 }
      );
    }

    const recordId = createResult.data?.createTableRecord?.table_record?.id;

    // Step 3: Connect record to card (if cardId provided)
    if (cardId && recordId) {
      const connectQuery = `
        mutation {
          updateCardField(input: {
            card_id: ${cardId}
            field_id: "fase_liberado_vistoria_registro_de_enxoval"
            new_value: ["${recordId}"]
          }) {
            success
          }
        }
      `;
      await pipefyQuery(connectQuery);
    }

    return NextResponse.json({
      success: true,
      recordId,
      message: "Registro criado com sucesso!",
    });
  } catch (error) {
    console.error("Erro ao submeter ao Pipefy:", error);
    return NextResponse.json(
      { error: "Erro interno ao processar a requisição" },
      { status: 500 }
    );
  }
}
