import { NextRequest, NextResponse } from "next/server";
import {
  requireAuth,
  updateCardTitle,
  findCardsByTitleInPipe,
} from "@/lib/pipefy";

const PIPES_BUSCA: { id: string; label: string }[] = [
  { id: "303781436", label: "Pipe 1 — Implantação" },
  { id: "303828424", label: "Pipe 2 — Adequação" },
  { id: "303807224", label: "Pipe 0 — Onboarding" },
  { id: "303024130", label: "Pipe 5.1 — Anúncios" },
];

interface TrocaResultado {
  cardId: string;
  pipeLabel: string;
  phaseName: string | null;
  tituloAntigo: string;
  status: "ok" | "erro";
  erro?: string;
}

async function findExactMatches(
  pipeId: string,
  pipeLabel: string,
  needle: string
) {
  const matches = await findCardsByTitleInPipe(pipeId, needle);
  const target = needle.toUpperCase().trim();
  return matches
    .filter((m) => m.title.toUpperCase().trim() === target)
    .map((m) => ({
      cardId: m.cardId,
      title: m.title,
      phaseName: m.phaseName,
      pipeLabel,
    }));
}

export async function POST(request: NextRequest) {
  const authToken = request.cookies.get("auth_token")?.value;
  if (!requireAuth(authToken)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await request.json().catch(() => ({}));
    const codigoAntigo = String(body.codigoAntigo || "").trim();
    const codigoNovo = String(body.codigoNovo || "").trim();

    if (!codigoAntigo || !codigoNovo) {
      return NextResponse.json(
        { error: "codigoAntigo e codigoNovo são obrigatórios" },
        { status: 400 }
      );
    }
    if (codigoAntigo.toUpperCase() === codigoNovo.toUpperCase()) {
      return NextResponse.json(
        { error: "Código antigo e novo são iguais" },
        { status: 400 }
      );
    }
    // Validação de formato leve (alfanumérico + hifens, sem caracteres exóticos)
    if (!/^[A-Za-z0-9._-]+$/.test(codigoNovo)) {
      return NextResponse.json(
        { error: "codigoNovo tem caracteres inválidos" },
        { status: 400 }
      );
    }

    // 1) Buscar matches exatos em paralelo nos 4 pipes
    const matchesPorPipe = await Promise.all(
      PIPES_BUSCA.map((p) => findExactMatches(p.id, p.label, codigoAntigo))
    );
    const matches = matchesPorPipe.flat();

    if (matches.length === 0) {
      return NextResponse.json({
        success: true,
        codigoAntigo,
        codigoNovo,
        total: 0,
        sucessos: 0,
        erros: 0,
        resultados: [],
        mensagem: `Nenhum card com título "${codigoAntigo}" nos pipes monitorados.`,
      });
    }

    // 2) Atualizar título de cada card — try/catch individual pra não derrubar o lote
    const resultados: TrocaResultado[] = [];
    for (const m of matches) {
      try {
        await updateCardTitle(m.cardId, codigoNovo);
        resultados.push({
          cardId: m.cardId,
          pipeLabel: m.pipeLabel,
          phaseName: m.phaseName,
          tituloAntigo: m.title,
          status: "ok",
        });
      } catch (err: any) {
        resultados.push({
          cardId: m.cardId,
          pipeLabel: m.pipeLabel,
          phaseName: m.phaseName,
          tituloAntigo: m.title,
          status: "erro",
          erro: err?.message || String(err),
        });
      }
    }

    const sucessos = resultados.filter((r) => r.status === "ok").length;
    const erros = resultados.filter((r) => r.status === "erro").length;

    return NextResponse.json({
      success: true,
      codigoAntigo,
      codigoNovo,
      total: resultados.length,
      sucessos,
      erros,
      resultados,
      mensagem:
        erros === 0
          ? `${sucessos} card(s) renomeados de "${codigoAntigo}" para "${codigoNovo}".`
          : `${sucessos} ok / ${erros} com erro — ver detalhes.`,
    });
  } catch (error: any) {
    console.error("Erro em pipefy-trocar-titulos:", error);
    return NextResponse.json(
      { error: error.message || "Erro ao trocar títulos" },
      { status: 500 }
    );
  }
}
