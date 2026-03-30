import { NextRequest, NextResponse } from "next/server";
import { pipefyQuery, requireAuth } from "@/lib/pipefy";

// Pipe 1 - Implantação/Mãe - todas as fases relevantes
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
  "323044845",  // Fase 11
];

export async function GET(req: NextRequest) {
  if (!requireAuth(req.cookies.get("auth_token")?.value)) {
    return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  }

  const code = req.nextUrl.searchParams.get("code");
  if (!code) {
    return NextResponse.json({ error: "Código obrigatório" }, { status: 400 });
  }

  try {
    for (const phaseId of PIPE_1_PHASES) {
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
        const field = fields.find((f: any) =>
          f.name?.toLowerCase() === "anfitrião escolhido"
        );

        if (field?.value) {
          return NextResponse.json({ success: true, franqueado: field.value });
        }
      }
    }

    return NextResponse.json({ success: true, franqueado: "" });
  } catch (err: unknown) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}
