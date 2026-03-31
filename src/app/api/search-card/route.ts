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

  const searchParams = request.nextUrl.searchParams;
  const search = searchParams.get("q") || "";

  if (!PIPEFY_TOKEN) {
    return NextResponse.json({ error: "Token não configurado" }, { status: 500 });
  }

  if (!search) {
    return NextResponse.json({ error: "Parâmetro de busca vazio" }, { status: 400 });
  }

  try {
    // Search by card title in Phase 5
    const query = `
      {
        phase(id: ${PHASE_5_ID}) {
          cards(first: 50, search: { title: "${search.replace(/"/g, '\\"')}" }) {
            edges {
              node {
                id
                title
              }
            }
          }
        }
      }
    `;

    const result = await pipefyQuery(query);

    if (result.errors) {
      // Fallback: fetch all cards and filter locally
      const fallbackQuery = `
        {
          phase(id: ${PHASE_5_ID}) {
            cards(first: 100) {
              edges {
                node {
                  id
                  title
                }
              }
            }
          }
        }
      `;
      const fallbackResult = await pipefyQuery(fallbackQuery);
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
