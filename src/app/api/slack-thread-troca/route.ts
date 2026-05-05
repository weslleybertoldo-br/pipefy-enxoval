import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/pipefy";

// Bot token nao esta no canal #suporte-operação (`not_in_channel`).
// User token (xoxp) consegue ler como o usuario logado.
const SLACK_USER_TOKEN = process.env.SLACK_USER_TOKEN || "";
const SLACK_BOT_TOKEN = process.env.SLACK_BOT_TOKEN || "";

interface SlackUser {
  id: string;
  name: string;
}

interface SlackReaction {
  name: string;
  users: SlackUser[];
}

interface SlackMessage {
  ts: string;
  time: string; // HH:MM BRT
  iso: string; // ISO completo
  text: string;
  user: SlackUser | null;
  reactions: SlackReaction[];
  isTemplateEnviar: boolean; // mensagem do botao enviar
  isStatusChange: boolean; // mensagens "Em Andamento" / "Aguardando"
  isRoot: boolean; // primeira da thread (Novo Suporte)
}

const userCache = new Map<string, SlackUser>();

async function resolveUser(userId: string): Promise<SlackUser> {
  if (userCache.has(userId)) return userCache.get(userId)!;
  try {
    const r = await fetch(
      `https://slack.com/api/users.info?user=${encodeURIComponent(userId)}`,
      { headers: { Authorization: `Bearer ${SLACK_USER_TOKEN}` } }
    );
    const d = await r.json();
    if (d.ok && d.user) {
      const u: SlackUser = {
        id: userId,
        name: d.user.real_name || d.user.name || userId,
      };
      userCache.set(userId, u);
      return u;
    }
  } catch {}
  const fallback = { id: userId, name: userId };
  userCache.set(userId, fallback);
  return fallback;
}

function brTimeFromTs(ts: string): { time: string; iso: string } {
  const sec = parseFloat(ts);
  const d = new Date(sec * 1000);
  // BRT = UTC-3
  const brt = new Date(d.getTime() - 3 * 60 * 60 * 1000);
  const hh = String(brt.getUTCHours()).padStart(2, "0");
  const mm = String(brt.getUTCMinutes()).padStart(2, "0");
  return { time: `${hh}:${mm}`, iso: d.toISOString() };
}

export async function GET(request: NextRequest) {
  const authToken = request.cookies.get("auth_token")?.value;
  if (!requireAuth(authToken)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const token = SLACK_USER_TOKEN || SLACK_BOT_TOKEN;
  if (!token) {
    return NextResponse.json(
      { error: "SLACK_USER_TOKEN/SLACK_BOT_TOKEN nao configurado" },
      { status: 500 }
    );
  }

  const channel = (request.nextUrl.searchParams.get("channel") || "").trim();
  const ts = (request.nextUrl.searchParams.get("ts") || "").trim();
  const codigoAntigo = (
    request.nextUrl.searchParams.get("codigoAntigo") || ""
  ).trim();

  if (!channel || !ts) {
    return NextResponse.json(
      { error: "channel e ts obrigatorios" },
      { status: 400 }
    );
  }

  try {
    const r = await fetch(
      `https://slack.com/api/conversations.replies?channel=${encodeURIComponent(channel)}&ts=${encodeURIComponent(ts)}&limit=200`,
      { headers: { Authorization: `Bearer ${token}` } }
    );
    const data = await r.json();
    if (!data.ok) {
      return NextResponse.json(
        { error: `Slack: ${data.error}` },
        { status: 502 }
      );
    }

    const rawMsgs: any[] = data.messages || [];
    const msgs: SlackMessage[] = [];

    for (let i = 0; i < rawMsgs.length; i++) {
      const m = rawMsgs[i];
      const text = m.text || "";
      const { time, iso } = brTimeFromTs(m.ts);

      // Resolver author (m.user OU m.username pra bot/app)
      let user: SlackUser | null = null;
      if (m.user) {
        user = await resolveUser(m.user);
      } else if (m.username) {
        user = { id: m.bot_id || "bot", name: m.username };
      } else if (m.bot_id) {
        user = { id: m.bot_id, name: "Bot" };
      }

      // Resolver users em reactions
      const reactions: SlackReaction[] = [];
      for (const r of m.reactions || []) {
        const users = await Promise.all(
          (r.users || []).map((uid: string) => resolveUser(uid))
        );
        reactions.push({ name: r.name, users });
      }

      // Heuristicas de classificacao
      const lower = text.toLowerCase();
      const isRoot = i === 0;
      const isStatusChange =
        text.includes(":arrows_counterclockwise:") ||
        text.includes(":hourglass_flowing_sand:") ||
        text.includes(":white_check_mark:") ||
        /Em Andamento|Aguardando|Concluído|Concluido|Arquivado/i.test(
          text.split("\n")[0] || ""
        );
      const isTemplateEnviar =
        lower.includes("troca de código está em andamento") ||
        lower.includes("troca de codigo esta em andamento") ||
        (codigoAntigo &&
          text.includes(codigoAntigo) &&
          lower.includes("status do imóvel"));

      msgs.push({
        ts: m.ts,
        time,
        iso,
        text,
        user,
        reactions,
        isTemplateEnviar: !!isTemplateEnviar,
        isStatusChange,
        isRoot,
      });
    }

    const templateMsg = msgs.find((m) => m.isTemplateEnviar) || null;
    const aguardandoIdx = msgs.findIndex(
      (m) => m.isStatusChange && /Aguardando/i.test(m.text)
    );
    const repliesAfterAguardando =
      aguardandoIdx >= 0
        ? msgs.slice(aguardandoIdx + 1).filter((m) => !m.isStatusChange)
        : [];

    return NextResponse.json({
      success: true,
      totalMessages: msgs.length,
      lastActivity: msgs.length > 0 ? msgs[msgs.length - 1].iso : null,
      lastActivityTime:
        msgs.length > 0 ? msgs[msgs.length - 1].time : null,
      templateMessage: templateMsg,
      repliesAfterAguardando,
      allMessages: msgs,
    });
  } catch (err: any) {
    return NextResponse.json(
      { error: err?.message || String(err) },
      { status: 500 }
    );
  }
}
