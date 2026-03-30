import { NextRequest, NextResponse } from "next/server";
import { pipefyQuery, fetchAllCardsFromPhase, requireAuth, PHASE_5_ID } from "@/lib/pipefy";

// Buscar cards da Fase 5 com o campo de registro de enxoval
async function getCardsWithEnxovalInfo(): Promise<any[]> {
  // Buscar com fields para verificar se tem registro de enxoval conectado
  let allCards: any[] = [];
  let cursor: string | undefined;
  let pages = 0;

  while (pages < 50) {
    const afterClause = cursor ? `, after: "${cursor}"` : "";
    const result = await pipefyQuery(`{
      phase(id: ${PHASE_5_ID}) {
        cards(first: 50${afterClause}) {
          edges {
            node {
              id
              title
              fields {
                field_id
                name
                value
                array_value
              }
            }
          }
          pageInfo { hasNextPage endCursor }
        }
      }
    }`);

    const data = result?.data?.phase?.cards;
    const edges = data?.edges || [];
    if (edges.length === 0) break;

    allCards = [...allCards, ...edges.map((e: any) => e.node)];

    if (!data?.pageInfo?.hasNextPage) break;
    cursor = data.pageInfo.endCursor;
    if (!cursor) break;
    pages++;
  }

  return allCards;
}

export async function GET(req: NextRequest) {
  if (!requireAuth(req.cookies.get("auth_token")?.value)) {
    return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  }

  try {
    const cards = await getCardsWithEnxovalInfo();

    const result = cards.map((card) => {
      // Procurar o campo de registro de enxoval
      const enxovalField = (card.fields || []).find(
        (f: any) => f.field_id === "fase_liberado_vistoria_registro_de_enxoval"
      );

      // O campo pode ter value (string) ou array_value (array de IDs)
      const hasRecord = !!(
        enxovalField &&
        ((enxovalField.value && enxovalField.value !== "[]" && enxovalField.value !== "") ||
          (enxovalField.array_value && enxovalField.array_value.length > 0))
      );

      let recordId = "";
      if (hasRecord) {
        if (enxovalField.array_value?.length > 0) {
          recordId = enxovalField.array_value[0];
        } else if (enxovalField.value) {
          // Pode ser JSON array ou string simples
          try {
            const parsed = JSON.parse(enxovalField.value);
            recordId = Array.isArray(parsed) ? parsed[0] || "" : String(parsed);
          } catch {
            recordId = enxovalField.value;
          }
        }
      }

      return {
        id: card.id,
        title: card.title,
        hasRecord,
        recordId,
      };
    });

    // Ordenar: sem registro primeiro, depois com registro
    result.sort((a, b) => {
      if (a.hasRecord === b.hasRecord) return a.title.localeCompare(b.title);
      return a.hasRecord ? 1 : -1;
    });

    return NextResponse.json({
      success: true,
      totalCards: result.length,
      withRecord: result.filter((r) => r.hasRecord).length,
      withoutRecord: result.filter((r) => !r.hasRecord).length,
      cards: result,
    });
  } catch (err: unknown) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}
