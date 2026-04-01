import { NextRequest, NextResponse } from "next/server";
import { createHmac, timingSafeEqual } from "crypto";

const SLACK_TOKEN = process.env.SLACK_BOT_TOKEN || "";
const SIGNING_SECRET = process.env.SLACK_SIGNING_SECRET || "";

function verifySlackSignature(body: string, timestamp: string, signature: string): boolean {
  if (!SIGNING_SECRET) return false;
  // Rejeitar requests com mais de 5 minutos (previne replay attacks)
  if (Math.abs(Date.now() / 1000 - parseInt(timestamp)) > 300) return false;
  const baseString = `v0:${timestamp}:${body}`;
  const expected = "v0=" + createHmac("sha256", SIGNING_SECRET).update(baseString).digest("hex");
  if (expected.length !== signature.length) return false;
  return timingSafeEqual(Buffer.from(expected), Buffer.from(signature));
}

export async function POST(req: NextRequest) {
  try {
    // Verificar assinatura do Slack
    const rawBody = await req.text();
    const timestamp = req.headers.get("x-slack-request-timestamp") || "";
    const signature = req.headers.get("x-slack-signature") || "";
    if (!verifySlackSignature(rawBody, timestamp, signature)) {
      return new NextResponse("Unauthorized", { status: 401 });
    }

    const params = new URLSearchParams(rawBody);
    const payloadStr = params.get("payload");
    if (!payloadStr || typeof payloadStr !== "string") {
      return new NextResponse("", { status: 400 });
    }

    const payload = JSON.parse(payloadStr);

    if (payload.type === "block_actions") {
      const action = payload.actions?.[0];

      if (action?.action_id === "despesa_lancada") {
        const channelId = payload.channel?.id;
        const threadTs = payload.message?.ts;
        const userId = action.value;

        // Validar userId formato Slack
        if (!userId || !/^U[A-Z0-9]+$/i.test(userId)) {
          return new NextResponse("", { status: 200 });
        }

        // Responder na thread
        const replyRes = await fetch("https://slack.com/api/chat.postMessage", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${SLACK_TOKEN}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            channel: channelId,
            thread_ts: threadTs,
            text: `<@${userId}> a despesa foi lançada, o card foi finalizado :happygoat:`,
          }),
        });
        const replyData = await replyRes.json();
        if (!replyData.ok) console.error("Slack reply error:", replyData.error);

        // Remover o botão da mensagem original
        const originalBlocks = payload.message?.blocks || [];
        const blocksWithoutButton = originalBlocks.filter((b: any) => b.type !== "actions");
        blocksWithoutButton.push({
          type: "context",
          elements: [{ type: "mrkdwn", text: "✅ _Despesa lançada_" }],
        });

        const updateRes = await fetch("https://slack.com/api/chat.update", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${SLACK_TOKEN}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            channel: channelId,
            ts: threadTs,
            blocks: blocksWithoutButton,
            text: (payload.message?.text || "Lançamento de despesa") + " ✅ Despesa lançada",
          }),
        });
        const updateData = await updateRes.json();
        if (!updateData.ok) console.error("Slack update error:", updateData.error);
      }
    }

    return new NextResponse("", { status: 200 });
  } catch (err) {
    console.error("Slack interaction error:", err);
    return new NextResponse("", { status: 200 });
  }
}
