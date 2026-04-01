import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/pipefy";

const SLACK_TOKEN = process.env.SLACK_BOT_TOKEN || "";
const SLACK_CHANNEL_ID = "C09CQRNEVLZ";

// GET: Listar mensagens recentes do canal
export async function GET(req: NextRequest) {
  if (!requireAuth(req.cookies.get("auth_token")?.value)) {
    return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  }
  try {
    const limit = req.nextUrl.searchParams.get("limit") || "20";
    const res = await fetch(`https://slack.com/api/conversations.history?channel=${SLACK_CHANNEL_ID}&limit=${limit}`, {
      headers: { Authorization: `Bearer ${SLACK_TOKEN}` },
    });
    const data = await res.json();
    if (!data.ok) return NextResponse.json({ error: data.error }, { status: 500 });

    const messages = (data.messages || []).map((m: any) => ({
      ts: m.ts,
      text: m.text || "",
      date: new Date(parseFloat(m.ts) * 1000).toISOString(),
      botMessage: m.bot_id ? true : false,
    }));

    return NextResponse.json({ success: true, messages });
  } catch (err: unknown) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}

// DELETE: Apagar mensagem
export async function DELETE(req: NextRequest) {
  if (!requireAuth(req.cookies.get("auth_token")?.value)) {
    return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  }
  try {
    const { ts } = await req.json();
    if (!ts) return NextResponse.json({ error: "ts obrigatório" }, { status: 400 });

    const res = await fetch("https://slack.com/api/chat.delete", {
      method: "POST",
      headers: { Authorization: `Bearer ${SLACK_TOKEN}`, "Content-Type": "application/json" },
      body: JSON.stringify({ channel: SLACK_CHANNEL_ID, ts }),
    });
    const data = await res.json();
    if (!data.ok) return NextResponse.json({ error: data.error }, { status: 500 });

    return NextResponse.json({ success: true });
  } catch (err: unknown) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}
