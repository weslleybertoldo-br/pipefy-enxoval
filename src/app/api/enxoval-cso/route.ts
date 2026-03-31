import { NextRequest, NextResponse } from "next/server";
import { pipefyQuery, fetchAllCardsFromPhase, createComment, validateCardId, requireAuth, PHASE_5_ID } from "@/lib/pipefy";

// Pipe 0 - Onboarding - fases para buscar tags
const PIPE_0_PHASES = [
  "323192886", "326998147", "323192887", "323290601", "323192888",
  "333705823", "333706135", "323543301", "323192900", "323192905",
  "323665911", "338531443", "323634845", "329664298",
];

// Pipe 2 - Adequação - fases para buscar comentário
const PIPE_2_PHASES = [
  "323529355", "323315791", "323529394", "323529403",
  "333848207", "333848127", "323315793",
];

function getEnxovalStatus(comment: string): "ok" | "pendente" | "comprado" | "unknown" {
  if (!comment) return "unknown";
  // Verificar linha por linha
  const lines = comment.split("\n");
  for (const line of lines) {
    const trimmed = line.trim();
    if (/^✔️\s*ENXOVAL/i.test(trimmed)) return "ok";
    if (/^❌\s*ENXOVAL\s*:\s*COMPRADO/i.test(trimmed)) return "comprado";
    if (/^❌\s*ENXOVAL/i.test(trimmed)) return "pendente";
  }
  return "unknown";
}

// Buscar TODOS os cards do Pipe 0 de uma vez e criar mapa por título
async function buildPipe0TagsMap(): Promise<Map<string, string[]>> {
  const tagsMap = new Map<string, string[]>();

  // Buscar em paralelo (3 fases por vez para não sobrecarregar)
  for (let i = 0; i < PIPE_0_PHASES.length; i += 3) {
    const batch = PIPE_0_PHASES.slice(i, i + 3);
    const results = await Promise.all(
      batch.map(async (phaseId) => {
        try {
          const result = await pipefyQuery(`{
            phase(id: ${phaseId}) {
              cards(first: 100) {
                edges { node { title labels { name } } }
              }
            }
          }`);
          return result?.data?.phase?.cards?.edges || [];
        } catch { return []; }
      })
    );

    for (const edges of results) {
      for (const edge of edges) {
        const title = edge.node.title?.toUpperCase();
        if (title && !tagsMap.has(title)) {
          tagsMap.set(title, (edge.node.labels || []).map((l: any) => l.name));
        }
      }
    }
  }

  return tagsMap;
}

// Buscar card no Pipe 2 (para pegar comentário e id)
async function getCardFromPipe2(code: string): Promise<{ id: string; lastComment: string } | null> {
  for (const phaseId of PIPE_2_PHASES) {
    try {
      const result = await pipefyQuery(`{
        phase(id: ${phaseId}) {
          cards(first: 3, search: { title: "${JSON.stringify(code).slice(1, -1)}" }) {
            edges { node { id title comments { id text } fields { name value } } }
          }
        }
      }`);
      const edges = result?.data?.phase?.cards?.edges || [];
      const card = edges.find((e: any) => e.node.title.toUpperCase() === code.toUpperCase());
      if (card) {
        const comments = card.node.comments || [];
        return {
          id: card.node.id,
          lastComment: comments[0]?.text || "",
        };
      }
    } catch { /* continua */ }
  }
  return null;
}

// GET: Listar cards da Fase 5 com enxoval pendente
export async function GET(req: NextRequest) {
  if (!requireAuth(req.cookies.get("auth_token")?.value)) {
    return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  }
  try {
    // Buscar cards da Fase 5 e tags do Pipe 0 em paralelo
    const [allCards, pipe0Tags] = await Promise.all([
      fetchAllCardsFromPhase(PHASE_5_ID),
      buildPipe0TagsMap(),
    ]);

    const results = [];
    for (const c of allCards) {
      const lastComment = (c.comments || [])[0]?.text || "";
      const status = getEnxovalStatus(lastComment);

      if (status !== "pendente") continue;

      const tags = pipe0Tags.get(c.title?.toUpperCase()) || [];
      const hasEnxovalComprado = tags.some((t) => t.toUpperCase().includes("ENXOVAL COMPRADO"));

      results.push({
        id: c.id,
        title: c.title,
        lastComment,
        tags,
        hasEnxovalComprado,
      });
    }

    return NextResponse.json({
      success: true,
      totalCards: results.length,
      cards: results,
    });
  } catch (err: unknown) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}

// POST: Atualizar enxoval para "COMPRADO - PP CSO"
export async function POST(req: NextRequest) {
  if (!requireAuth(req.cookies.get("auth_token")?.value)) {
    return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  }
  try {
    const { code } = await req.json();
    if (!code) return NextResponse.json({ error: "Código obrigatório" }, { status: 400 });

    // Buscar card no Pipe 2
    const pipe2Card = await getCardFromPipe2(code);
    if (!pipe2Card) {
      return NextResponse.json({ error: `Card "${code}" não encontrado no Pipe 2` }, { status: 404 });
    }

    const cardId = validateCardId(pipe2Card.id);
    const actions: string[] = [];

    // 1. Atualizar comentário: trocar qualquer "❌ ENXOVAL..." por "❌ ENXOVAL: COMPRADO - PP CSO"
    if (pipe2Card.lastComment) {
      const newComment = pipe2Card.lastComment.replace(
        /❌\s*ENXOVAL[^\n]*/gi,
        "❌ ENXOVAL: COMPRADO - PP CSO"
      );
      await createComment(cardId, newComment);
      actions.push("Comentário atualizado");
    }

    // 2. Atualizar campo "Validação Enxoval"
    await pipefyQuery(`mutation {
      updateCardField(input: {
        card_id: ${cardId}
        field_id: "valida_o_enxoval"
        new_value: "❌ ENXOVAL: COMPRADO - PP CSO"
      }) { success }
    }`);
    actions.push("Campo Validação Enxoval atualizado");

    return NextResponse.json({ success: true, cardId, details: actions.join(" | ") });
  } catch (err: unknown) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}
