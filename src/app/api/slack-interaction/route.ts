import { NextRequest, NextResponse } from "next/server";

const SLACK_TOKEN = process.env.SLACK_BOT_TOKEN || "";

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const payload = JSON.parse(formData.get("payload") as string);

    if (payload.type === "block_actions") {
      const action = payload.actions?.[0];

      if (action?.action_id === "despesa_lancada") {
        const channelId = payload.channel?.id;
        const threadTs = payload.message?.ts;
        const userId = action.value; // Weslley user ID

        // Responder na thread
        await fetch("https://slack.com/api/chat.postMessage", {
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

        // Remover o botão da mensagem original (atualizar removendo o bloco de ações)
        const originalBlocks = payload.message?.blocks || [];
        const blocksWithoutButton = originalBlocks.filter((b: any) => b.type !== "actions");
        blocksWithoutButton.push({
          type: "context",
          elements: [{ type: "mrkdwn", text: "✅ _Despesa lançada_" }],
        });

        await fetch("https://slack.com/api/chat.update", {
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
      }
    }

    return new NextResponse("", { status: 200 });
  } catch (err) {
    console.error("Slack interaction error:", err);
    return new NextResponse("", { status: 200 });
  }
}
