import { GoogleGenerativeAI } from "@google/generative-ai";
import { NextRequest, NextResponse } from "next/server";

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);

export async function POST(req: NextRequest) {
  const { messages, theme, criteria } = await req.json();

  const conversationLog = messages
    .map((m: { role: string; content: string }) =>
      `【${m.role === "assistant" ? "試験官" : "受験者"}】${m.content}`
    )
    .join("\n\n");

  const prompt = `あなたは優秀な教育評価者です。以下の口頭試問の記録を詳細に分析し、採点してください。

試問テーマ: ${theme}

評価基準（各33点満点、合計100点満点）:
${criteria.map((c: string, i: number) => `${i + 1}. ${c}`).join("\n")}

採点基準:
- 90-100点: 非常に優秀
- 70-89点: 良好
- 50-69点: 普通
- 30-49点: 要改善
- 0-29点: 不足

以下の口頭試問の記録を評価してください:

${conversationLog}

必ず以下のJSON形式のみで回答してください（コードブロック不要、他のテキスト不要）:
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
    const model = genAI.getGenerativeModel({
      model: "gemini-2.0-flash",
    });

    const result = await model.generateContent(prompt);
    const text = result.response.text();

    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      return NextResponse.json({ error: "Invalid response format" }, { status: 500 });
    }

    const scoreResult = JSON.parse(jsonMatch[0]);
    return NextResponse.json(scoreResult);
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "Failed to score" }, { status: 500 });
  }
}
