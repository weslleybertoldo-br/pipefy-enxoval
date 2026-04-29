import { NextRequest, NextResponse } from "next/server";
import { pipefyQuery, requireAuth, sanitizeGraphQL } from "@/lib/pipefy";

// Pipes onde uma troca de código tipicamente impacta cards
const PIPES_BUSCA: { id: string; label: string }[] = [
  { id: "303781436", label: "Pipe 1 — Implantação" },
  { id: "303828424", label: "Pipe 2 — Adequação" },
  { id: "303807224", label: "Pipe 0 — Onboarding" },
  { id: "303024130", label: "Pipe 5.1 — Anúncios" },
];

interface MatchedCard {
  pipeId: string;
  pipeLabel: string;
  cardId: string;
  title: string;
  phaseId: string | null;
  phaseName: string | null;
  url: string | null;
  matchType: "exact" | "partial";
}

async function searchCardsInPipe(
  pipeId: string,
  pipeLabel: string,
  needle: string
): Promise<MatchedCard[]> {
  const escaped = sanitizeGraphQL(needle);
  // findCards faz match parcial case-insensitive no título
  const result = await pipefyQuery(`{
    findCards(pipeId: ${pipeId}, search: { title: "${escaped}" }, first: 30) {
      edges {
        node {
          id
          title
          url
          current_phase { id name }
        }
      }
    }
  }`).catch((err) => {
    console.error(`[pipefy-preview-troca] findCards falhou em ${pipeLabel}:`, err.message);
    return null;
  });

  const edges = result?.data?.findCards?.edges || [];
  const target = needle.toUpperCase().trim();

  return edges.map((e: any): MatchedCard => {
    const title: string = e.node.title || "";
    const matchType =
      title.toUpperCase().trim() === target ? "exact" : "partial";
    return {
      pipeId,
      pipeLabel,
      cardId: e.node.id,
      title,
      phaseId: e.node.current_phase?.id || null,
      phaseName: e.node.current_phase?.name || null,
      url: e.node.url || null,
      matchType,
    };
  });
}

export async function GET(request: NextRequest) {
  const authToken = request.cookies.get("auth_token")?.value;
  if (!requireAuth(authToken)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { searchParams } = new URL(request.url);
    const codigoAntigo = (searchParams.get("codigoAntigo") || "").trim();
    const codigoNovo = (searchParams.get("codigoNovo") || "").trim();

    if (!codigoAntigo) {
      return NextResponse.json(
        { error: "codigoAntigo obrigatório" },
        { status: 400 }
      );
    }

    // Buscar em paralelo nos 4 pipes (matches do código antigo + verificação de
    // duplicidade do código novo, se fornecido)
    const buscas = PIPES_BUSCA.flatMap((p) => {
      const lista: Promise<MatchedCard[]>[] = [
        searchCardsInPipe(p.id, p.label, codigoAntigo),
      ];
      if (codigoNovo) {
        lista.push(searchCardsInPipe(p.id, p.label, codigoNovo));
      }
      return lista;
    });

    const results = await Promise.all(buscas);

    const matchesAntigo: MatchedCard[] = [];
    const matchesNovo: MatchedCard[] = [];

    let idx = 0;
    for (const p of PIPES_BUSCA) {
      matchesAntigo.push(...results[idx++]);
      if (codigoNovo) {
        matchesNovo.push(...results[idx++]);
      }
    }

    // Agrupar exact / partial separados
    const exatosAntigo = matchesAntigo.filter((m) => m.matchType === "exact");
    const parciaisAntigo = matchesAntigo.filter((m) => m.matchType === "partial");
    const exatosNovo = matchesNovo.filter((m) => m.matchType === "exact");

    let resumo = "";
    if (exatosAntigo.length === 0) {
      resumo = `Nenhum card com título "${codigoAntigo}" encontrado nos ${PIPES_BUSCA.length} pipes monitorados.`;
    } else {
      const porPipe = exatosAntigo.reduce<Record<string, number>>((acc, m) => {
        acc[m.pipeLabel] = (acc[m.pipeLabel] || 0) + 1;
        return acc;
      }, {});
      const partes = Object.entries(porPipe).map(
        ([pipe, n]) => `${pipe}: ${n}`
      );
      resumo = `${exatosAntigo.length} card(s) com "${codigoAntigo}" — ${partes.join(", ")}.`;
    }

    if (exatosNovo.length > 0) {
      resumo += ` ⚠ ${exatosNovo.length} card(s) já existem com "${codigoNovo}" — risco de duplicidade.`;
    }

    return NextResponse.json({
      success: true,
      codigoAntigo,
      codigoNovo,
      resumo,
      exatosAntigo,
      parciaisAntigo,
      exatosNovo,
      pipesPesquisados: PIPES_BUSCA,
    });
  } catch (error: any) {
    console.error("Erro em pipefy-preview-troca:", error);
    return NextResponse.json(
      { error: error.message || "Erro ao consultar Pipefy" },
      { status: 500 }
    );
  }
}
