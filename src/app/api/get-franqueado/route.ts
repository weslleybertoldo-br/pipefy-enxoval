import { NextRequest, NextResponse } from "next/server";
import { pipefyQuery, fetchAllCardsFromPhase, requireAuth } from "@/lib/pipefy";

// Fase 5 do Pipe 2 (Adequação) para buscar franqueado pelo código do imóvel
const PIPE_1_ID = "303781436"; // Pipe 1 - Implantação/Mãe

export async function GET(req: NextRequest) {
  if (!requireAuth(req.cookies.get("auth_token")?.value)) {
    return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  }

  const code = req.nextUrl.searchParams.get("code");
  if (!code) {
    return NextResponse.json({ error: "Código obrigatório" }, { status: 400 });
  }

  try {
    // Buscar no Pipe 1 pelo título (código do imóvel)
    const result = await pipefyQuery(`{
      pipe(id: ${PIPE_1_ID}) {
        cards(first: 5, search: { title: "${code.replace(/"/g, '\\"')}" }) {
          edges {
            node {
              id
              title
              fields { name value }
            }
          }
        }
      }
    }`);

    const edges = result?.data?.pipe?.cards?.edges || [];
    const card = edges.find((e: any) => e.node.title.toUpperCase() === code.toUpperCase());

    if (!card) {
      return NextResponse.json({ success: true, franqueado: "" });
    }

    // Procurar campo de franquia/franqueado
    const fields = card.node.fields || [];
    const franquiaField = fields.find((f: any) =>
      f.name?.toLowerCase().includes("franquia") ||
      f.name?.toLowerCase().includes("franqueado") ||
      f.name?.toLowerCase().includes("anfitrião")
    );

    return NextResponse.json({
      success: true,
      franqueado: franquiaField?.value || "",
      cardTitle: card.node.title,
    });
  } catch (err: unknown) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}
