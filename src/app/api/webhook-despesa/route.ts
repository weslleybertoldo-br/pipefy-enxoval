import { NextRequest, NextResponse } from "next/server";
import { pipefyQuery, PHASE_5_ID } from "@/lib/pipefy";

const SLACK_TOKEN = process.env.SLACK_BOT_TOKEN || "";
const CHANNEL_ID = "C09CQRNEVLZ"; // despesas-implantação

async function sendSlackMessage(text: string) {
  if (!SLACK_TOKEN) throw new Error("SLACK_BOT_TOKEN não configurado");
  const res = await fetch("https://slack.com/api/chat.postMessage", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${SLACK_TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ channel: CHANNEL_ID, text }),
  });
  const result = await res.json();
  if (!result.ok) throw new Error(`Slack: ${result.error}`);
  return result;
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    // Pipefy envia o card_id no webhook
    const cardId = body?.data?.card?.id || body?.card_id || body?.cardId;
    if (!cardId) {
      return NextResponse.json({ error: "card_id não encontrado" }, { status: 400 });
    }

    // Buscar dados do card
    const result = await pipefyQuery(`{
      card(id: ${cardId}) {
        id title
        fields { name value }
      }
    }`);

    const card = result?.data?.card;
    if (!card) {
      return NextResponse.json({ error: "Card não encontrado" }, { status: 404 });
    }

    // Extrair campos
    const fields = card.fields || [];
    const codigo = card.title || "";
    const franquiaField = fields.find((f: any) =>
      f.name?.toLowerCase().includes("franquia escolhida") ||
      f.name?.toLowerCase().includes("anfitrião responsável")
    );
    const franquia = franquiaField?.value || "Não informado";

    // Data de hoje
    const now = new Date();
    const dd = String(now.getDate()).padStart(2, "0");
    const mm = String(now.getMonth() + 1).padStart(2, "0");
    const yyyy = now.getFullYear();
    const dataHoje = `${dd}/${mm}/${yyyy}`;

    // Enviar mensagem no Slack
    const message = `📋 *Lançamento de Despesa*\n\n*Código do imóvel:* ${codigo}\n*Franquia responsável:* ${franquia}\n*Data que deve ser lançado:* ${dataHoje}`;
    await sendSlackMessage(message);

    return NextResponse.json({ success: true, message: "Mensagem enviada no Slack" });
  } catch (err: unknown) {
    console.error("Webhook despesa error:", err);
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}
