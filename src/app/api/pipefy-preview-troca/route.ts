import { NextRequest, NextResponse } from "next/server";
import { requireAuth, findCardsByTitleInPipe } from "@/lib/pipefy";

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
  let matches;
  try {
    matches = await findCardsByTitleInPipe(pipeId, needle);
  } catch (err: any) {
    console.error(
      `[pipefy-preview-troca] findCardsByTitleInPipe falhou em ${pipeLabel}:`,
      err.message
    );
    return [];
  }
  const target = needle.toUpperCase().trim();
  return matches.map((m): MatchedCard => ({
    pipeId,
    pipeLabel,
    cardId: m.cardId,
    title: m.title,
    phaseId: m.phaseId,
    phaseName: m.phaseName,
    url: m.url,
    matchType: m.title.toUpperCase().trim() === target ? "exact" : "partial",
  }));
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
    for (const _p of PIPES_BUSCA) {
      matchesAntigo.push(...results[idx++]);
      if (codigoNovo) {
        matchesNovo.push(...results[idx++]);
      }
    }

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
