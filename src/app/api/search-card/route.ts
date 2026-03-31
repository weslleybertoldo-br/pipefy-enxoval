import { NextRequest, NextResponse } from "next/server";
import { pipefyQuery, requireAuth, PHASE_5_ID, sanitizeGraphQL } from "@/lib/pipefy";

export async function GET(request: NextRequest) {
  if (!requireAuth(request.cookies.get("auth_token")?.value)) {
    return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  }

  const search = request.nextUrl.searchParams.get("q") || "";

  if (!search) {
    return NextResponse.json({ error: "Parâmetro de busca vazio" }, { status: 400 });
  }

  try {
    const escaped = sanitizeGraphQL(search);
    const result = await pipefyQuery(`{
      phase(id: ${PHASE_5_ID}) {
        cards(first: 50, search: { title: "${escaped}" }) {
          edges {
            node { id title }
          }
        }
      }
    }`);

    if (result.errors) {
      const fallbackResult = await pipefyQuery(`{
        phase(id: ${PHASE_5_ID}) {
          cards(first: 100) {
            edges {
              node { id title }
            }
          }
        }
      }`);
      const allCards = fallbackResult.data?.phase?.cards?.edges || [];
      const filtered = allCards
        .map((e: { node: { id: string; title: string } }) => e.node)
        .filter((c: { title: string }) =>
          c.title.toUpperCase().includes(search.toUpperCase())
        );

      return NextResponse.json({ success: true, cards: filtered });
    }

    const cards = (result.data?.phase?.cards?.edges || []).map(
      (e: { node: { id: string; title: string } }) => e.node
    );

    return NextResponse.json({ success: true, cards });
  } catch (error) {
    console.error("Erro ao buscar cards:", error);
    return NextResponse.json({ error: "Erro ao buscar cards" }, { status: 500 });
  }
}
