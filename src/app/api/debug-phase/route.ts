import { NextRequest, NextResponse } from "next/server";
import { pipefyQuery, requireAuth, PHASE_5_ID, sanitizeGraphQL } from "@/lib/pipefy";

export async function GET(request: NextRequest) {
  if (!requireAuth(request.cookies.get("auth_token")?.value)) {
    return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  }

  const search = request.nextUrl.searchParams.get("q") || "VIL0004";
  const escaped = sanitizeGraphQL(search);

  const phaseResult = await pipefyQuery(`{
    phase(id: ${PHASE_5_ID}) {
      id name cards_count
      cards(first: 5) {
        edges {
          node { id title fields { name value } }
        }
      }
    }
  }`);

  const searchResult = await pipefyQuery(`{
    phase(id: ${PHASE_5_ID}) {
      cards(first: 10, search: { title: "${escaped}" }) {
        edges {
          node { id title }
        }
      }
    }
  }`);

  const pipeResult = await pipefyQuery(`{
    pipe(id: 303828424) {
      phases { id name cards_count }
    }
  }`);

  return NextResponse.json({
    phase_5_id: PHASE_5_ID,
    phase_info: phaseResult.data?.phase ? {
      id: phaseResult.data.phase.id,
      name: phaseResult.data.phase.name,
      cards_count: phaseResult.data.phase.cards_count,
      sample_cards: phaseResult.data.phase.cards?.edges?.map(
        (e: { node: { id: string; title: string; fields: { name: string; value: string }[] } }) => ({
          id: e.node.id,
          title: e.node.title,
          fields: e.node.fields?.slice(0, 5),
        })
      ),
    } : null,
    phase_errors: phaseResult.errors || null,
    search_result: searchResult.data?.phase?.cards?.edges?.map(
      (e: { node: { id: string; title: string } }) => e.node
    ) || [],
    search_errors: searchResult.errors || null,
    pipe_phases: pipeResult.data?.pipe?.phases || [],
    pipe_errors: pipeResult.errors || null,
  });
}
