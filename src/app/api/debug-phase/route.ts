import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/pipefy";

const PIPEFY_API = "https://api.pipefy.com/graphql";
const PIPEFY_TOKEN = process.env.PIPEFY_TOKEN || "";
const PHASE_5_ID = "333848127";

async function pipefyQuery(query: string) {
  const res = await fetch(PIPEFY_API, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${PIPEFY_TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ query }),
  });
  return res.json();
}

export async function GET(request: NextRequest) {
  if (!requireAuth(request.cookies.get("auth_token")?.value)) {
    return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  }

  const search = request.nextUrl.searchParams.get("q") || "VIL0004";

  // 1. Check phase info
  const phaseQuery = `{
    phase(id: ${PHASE_5_ID}) {
      id
      name
      cards_count
      cards(first: 5) {
        edges {
          node {
            id
            title
            fields { field_id name value }
          }
        }
      }
    }
  }`;

  const phaseResult = await pipefyQuery(phaseQuery);

  // 2. Try search by title
  const searchQuery = `{
    phase(id: ${PHASE_5_ID}) {
      cards(first: 10, search: { title: "${search}" }) {
        edges {
          node { id title }
        }
      }
    }
  }`;

  const searchResult = await pipefyQuery(searchQuery);

  // 3. Also try allCards from the pipe
  const pipeQuery = `{
    pipe(id: 303828424) {
      phases { id name cards_count }
    }
  }`;

  const pipeResult = await pipefyQuery(pipeQuery);

  // Buscar labels do pipe
  const labelsQuery = `{ pipe(id: 303828424) { labels { id name } } }`;
  const labelsResult = await pipefyQuery(labelsQuery);

  // Buscar card EAF0404 para ver suas labels
  const cardSearch = request.nextUrl.searchParams.get("card") || "";
  let cardLabels = null;
  if (cardSearch) {
    for (const phaseId of [PHASE_5_ID, "323529403", "333848207", "323315793"]) {
      const r = await pipefyQuery(`{ phase(id: ${phaseId}) { cards(first: 3, search: { title: "${cardSearch}" }) { edges { node { id title labels { id name } } } } } }`);
      const edges = r?.data?.phase?.cards?.edges || [];
      const found = edges.find((e: any) => e.node.title.toUpperCase() === cardSearch.toUpperCase());
      if (found) { cardLabels = found.node; break; }
    }
  }

  return NextResponse.json({
    pipe_labels: labelsResult.data?.pipe?.labels || [],
    card_labels: cardLabels,
    phase_5_id: PHASE_5_ID,
    phase_info: phaseResult.data?.phase ? {
      id: phaseResult.data.phase.id,
      name: phaseResult.data.phase.name,
      cards_count: phaseResult.data.phase.cards_count,
      sample_cards: phaseResult.data.phase.cards?.edges?.map(
        (e: { node: { id: string; title: string; fields: { field_id: string; name: string; value: string }[] } }) => ({
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
