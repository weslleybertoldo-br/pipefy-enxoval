import { NextRequest, NextResponse } from "next/server";
import { pipefyQuery, PIPE_ID_TROCA } from "@/lib/pipefy";
import { requireAuth } from "@/lib/pipefy";

export async function GET(request: NextRequest) {
  const authToken = request.cookies.get("auth_token")?.value;

  if (!requireAuth(authToken)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { searchParams } = new URL(request.url);
    const search = searchParams.get("search") || "";

    // Buscar fases do pipe (phases é array direto, não tem edges)
    const phasesResult = await pipefyQuery(`{
      pipe(id: "${PIPE_ID_TROCA}") {
        phases {
          id
          name
        }
      }
    }`);

    const phases = phasesResult?.data?.pipe?.phases || [];
    console.log("[list-troca-codigo] Fases encontradas:", phases.length);
    console.log("[list-troca-codigo] Nomes das fases:", phases.map((p: any) => p.name));

    // Para cada fase, buscar cards
    const cardsByPhase: Record<string, any[]> = {};
    for (const phase of phases) {
      const query = search
        ? `{
            phase(id: "${phase.id}") {
              cards(first: 50, search: { title: "${search}" }) {
                edges {
                  node {
                    id
                    title
                    due_date
                    assignees { id name email }
                    labels { id name }
                    fields { name value }
                    url
                  }
                }
              }
            }
          }`
        : `{
            phase(id: "${phase.id}") {
              cards(first: 50) {
                edges {
                  node {
                    id
                    title
                    due_date
                    assignees { id name email }
                    labels { id name }
                    fields { name value }
                    url
                  }
                }
              }
            }
          }`;

      const result = await pipefyQuery(query);
      let cards = result?.data?.phase?.cards?.edges?.map((e: any) => e.node) || [];

      // Se é a fase Fazendo, buscar comments para cada card
      if (phase.name === "Fazendo") {
        for (const card of cards) {
          try {
            const commentResult = await pipefyQuery(`{
              card(id: "${card.id}") {
                comments {
                  id
                  text
                }
              }
            }`);
            const comments = commentResult?.data?.card?.comments || [];
            // Pegar o primeiro comentário (mais recente - vem em ordem)
            card.lastComment = comments[0] || null;
          } catch {
            card.lastComment = null;
          }
        }
      }
      if (cards.length > 0) {
        cardsByPhase[phase.name] = cards;
      }
    }

    return NextResponse.json({
      success: true,
      phases,
      cardsByPhase,
    });
  } catch (error: any) {
    console.error("Erro ao buscar cards Troca de Código:", error);
    return NextResponse.json(
      { error: error.message || "Erro ao buscar cards" },
      { status: 500 }
    );
  }
}
