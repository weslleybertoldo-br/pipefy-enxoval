import { NextRequest, NextResponse } from "next/server";
import { pipefyQuery, requireAuth, PHASE_3_ID, PHASE_4_ID, PHASE_5_ID } from "@/lib/pipefy";

// Buscar franqueado em todas as fases do Pipe 2
const PHASES_TO_SEARCH = [PHASE_3_ID, PHASE_4_ID, PHASE_5_ID];

export async function GET(req: NextRequest) {
  if (!requireAuth(req.cookies.get("auth_token")?.value)) {
    return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  }

  const code = req.nextUrl.searchParams.get("code");
  if (!code) {
    return NextResponse.json({ error: "Código obrigatório" }, { status: 400 });
  }

  try {
    for (const phaseId of PHASES_TO_SEARCH) {
      const result = await pipefyQuery(`{
        phase(id: ${phaseId}) {
          cards(first: 3, search: { title: "${code.replace(/"/g, '\\"')}" }) {
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
        const fields = card.node.fields || [];
        const franquiaField = fields.find((f: any) =>
          f.name?.toLowerCase().includes("franquia escolhida")
        );

        if (franquiaField?.value) {
          return NextResponse.json({ success: true, franqueado: franquiaField.value });
        }
      }
    }

    return NextResponse.json({ success: true, franqueado: "" });
  } catch (err: unknown) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}
