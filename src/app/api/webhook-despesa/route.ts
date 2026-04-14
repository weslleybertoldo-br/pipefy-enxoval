import { NextRequest, NextResponse } from "next/server";
import { timingSafeEqual } from "crypto";
import { pipefyQuery, validateCardId, toBrazilDate } from "@/lib/pipefy";

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
    // Verificar token secreto (obrigatório)
    const webhookSecret = process.env.WEBHOOK_SECRET;
    if (!webhookSecret) {
      return NextResponse.json({ error: "WEBHOOK_SECRET não configurado" }, { status: 500 });
    }
    const authHeader = req.headers.get("authorization")?.replace("Bearer ", "");

    const secretBuf = Buffer.from(webhookSecret);
    const headerMatch = authHeader
      ? authHeader.length === webhookSecret.length &&
        timingSafeEqual(Buffer.from(authHeader), secretBuf)
      : false;

    if (!headerMatch) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();

    const rawCardId = body?.data?.card?.id || body?.card_id || body?.cardId;
    if (!rawCardId) {
      return NextResponse.json({ error: "card_id não encontrado" }, { status: 400 });
    }
    const cardId = validateCardId(rawCardId);

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

    // Data de hoje (Brasília)
    const br = toBrazilDate(new Date());
    const dataHoje = `${String(br.day).padStart(2, "0")}/${String(br.month + 1).padStart(2, "0")}/${br.year}`;

    // Enviar mensagem no Slack
    const message = `📋 *Lançamento de Despesa*\n\n*Código do imóvel:* ${codigo}\n*Franquia responsável:* ${franquia}\n*Data que deve ser lançado:* ${dataHoje}`;
    await sendSlackMessage(message);

    return NextResponse.json({ success: true, message: "Mensagem enviada no Slack" });
  } catch (err: unknown) {
    console.error("Webhook despesa error:", err);
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}
