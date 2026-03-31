import { NextRequest, NextResponse } from "next/server";

const SLACK_TOKEN = process.env.SLACK_BOT_TOKEN || "";

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const payloadStr = formData.get("payload");
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
            text: "Lançamento de despesa - finalizado",
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
