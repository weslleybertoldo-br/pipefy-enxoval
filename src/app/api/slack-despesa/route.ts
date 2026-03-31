import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/pipefy";

const SLACK_TOKEN = process.env.SLACK_BOT_TOKEN || "";
const CHANNEL_ID = "C09CQRNEVLZ"; // despesas-implantação

export async function POST(req: NextRequest) {
  if (!requireAuth(req.cookies.get("auth_token")?.value)) {
    return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  }

  try {
    const { codigo, franquia, data } = await req.json();

    if (!codigo || !franquia || !data) {
      return NextResponse.json({ error: "Campos obrigatórios: código, franquia, data" }, { status: 400 });
    }

    if (!SLACK_TOKEN) {
      return NextResponse.json({ error: "SLACK_BOT_TOKEN não configurado" }, { status: 500 });
    }

    const message = `📋 *Lançamento de Despesa*\n\n*Código do imóvel:* ${codigo}\n*Franquia responsável:* ${franquia}\n*Data que deve ser lançado:* ${data}`;

    const res = await fetch("https://slack.com/api/chat.postMessage", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${SLACK_TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        channel: CHANNEL_ID,
        text: message,
      }),
    });

    const result = await res.json();

    if (!result.ok) {
      throw new Error(`Slack: ${result.error}`);
    }

    return NextResponse.json({ success: true, message: "Mensagem enviada no canal despesas-implantação" });
  } catch (err: unknown) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}
