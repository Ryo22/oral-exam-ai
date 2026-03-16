import Anthropic from "@anthropic-ai/sdk";
import { NextRequest, NextResponse } from "next/server";

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

export async function POST(req: NextRequest) {
  const { messages, theme, criteria } = await req.json();

  const conversationLog = messages
    .map((m: { role: string; content: string }) =>
      `【${m.role === "assistant" ? "試験官" : "受験者"}】${m.content}`
    )
    .join("\n\n");

  const systemPrompt = `あなたは優秀な教育評価者です。以下の口頭試問の記録を詳細に分析し、採点してください。

試問テーマ: ${theme}

評価基準（各33点満点、合計100点満点）:
${criteria.map((c: string, i: number) => `${i + 1}. ${c}`).join("\n")}

採点基準:
- 90-100点: 非常に優秀
- 70-89点: 良好
- 50-69点: 普通
- 30-49点: 要改善
- 0-29点: 不足

必ず以下のJSON形式のみで回答してください（他のテキストは不要）:
{
  "totalScore": <合計点数>,
  "criteria": [
    {
      "name": "<評価基準名>",
      "score": <点数(0-33)>,
      "comment": "<詳細な評価コメント（200文字程度）>"
    }
  ],
  "overallComment": "<総合評価コメント（300文字程度）>",
  "improvements": ["<改善点1>", "<改善点2>", "<改善点3>"]
}`;

  try {
    const response = await client.messages.create({
      model: "claude-opus-4-6",
      max_tokens: 2048,
      thinking: { type: "adaptive" },
      system: systemPrompt,
      messages: [
        {
          role: "user",
          content: `以下の口頭試問の記録を評価してください:\n\n${conversationLog}`,
        },
      ],
    });

    const text = response.content
      .filter((b) => b.type === "text")
      .map((b) => (b.type === "text" ? b.text : ""))
      .join("");

    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      return NextResponse.json({ error: "Invalid response format" }, { status: 500 });
    }

    const result = JSON.parse(jsonMatch[0]);
    return NextResponse.json(result);
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "Failed to score" }, { status: 500 });
  }
}
