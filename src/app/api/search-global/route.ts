import { NextRequest, NextResponse } from "next/server";
import { pipefyQuery, requireAuth, PIPE_ID } from "@/lib/pipefy";

function toBrazilDate(d: Date) {
  const parts = d.toLocaleString("en-US", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit" }).split("/");
  return { day: parseInt(parts[1]), month: parseInt(parts[0]) - 1, year: parseInt(parts[2]) };
}

export async function GET(req: NextRequest) {
  if (!requireAuth(req.cookies.get("auth_token")?.value)) {
    return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  }

  const search = req.nextUrl.searchParams.get("q");
  if (!search || search.trim().length < 2) {
    return NextResponse.json({ error: "Mínimo 2 caracteres" }, { status: 400 });
  }

  try {
    const escaped = JSON.stringify(search.trim()).slice(1, -1);

    const result = await pipefyQuery(`{
      pipe(id: ${PIPE_ID}) {
        cards(first: 10, search: { title: "${escaped}" }) {
          edges {
            node {
              id
              title
              due_date
              current_phase { name }
            }
          }
        }
      }
    }`);

    const edges = result?.data?.pipe?.cards?.edges || [];
    const cards = edges
      .map((e: any) => {
        const c = e.node;
        let dueFormatted = "Sem vencimento";
        if (c.due_date) {
          const br = toBrazilDate(new Date(c.due_date));
          dueFormatted = `${String(br.day).padStart(2, "0")}/${String(br.month + 1).padStart(2, "0")}/${br.year}`;
        }
        return {
          id: c.id,
          title: c.title,
          phase: c.current_phase?.name || "Desconhecida",
          dueFormatted,
        };
      })
      .filter((c: any) => c.title.toUpperCase().includes(search.trim().toUpperCase()));

    return NextResponse.json({ success: true, cards });
  } catch (err: unknown) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}
