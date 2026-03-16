import Anthropic from "@anthropic-ai/sdk";
import { NextRequest, NextResponse } from "next/server";

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

export async function POST(req: NextRequest) {
  const { messages, theme, criteria } = await req.json();

  const systemPrompt = `あなたは厳格で公平な口頭試問の試験官です。
試問テーマ: ${theme}

あなたの役割:
1. 指定されたテーマに基づいて質問を行う
2. 受験者の回答に対して深掘り質問をする
3. 【絶対禁止】試験中は正解・解説・ヒントを一切教えない
4. 回答が不十分な場合は「もう少し詳しく説明してください」などと促す
5. 回答が的外れな場合も正解を教えず「別の観点から考えてみてください」などと促す
6. 一度に一つの質問のみ行う
7. 簡潔に、試験官らしく振る舞う

評価観点（試験中は言及しない）:
${criteria.map((c: string, i: number) => `${i + 1}. ${c}`).join("\n")}

最初の質問から始めてください。`;

  try {
    const response = await client.messages.create({
      model: "claude-haiku-4-5",
      max_tokens: 512,
      system: systemPrompt,
      messages: messages.map((m: { role: string; content: string }) => ({
        role: m.role,
        content: m.content,
      })),
    });

    const text =
      response.content[0].type === "text" ? response.content[0].text : "";
    return NextResponse.json({ message: text });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "Failed to get response" }, { status: 500 });
  }
}
