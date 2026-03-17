import { GoogleGenerativeAI } from "@google/generative-ai";
import { NextRequest, NextResponse } from "next/server";

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);

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
    const model = genAI.getGenerativeModel({
      model: "gemini-2.0-flash",
      systemInstruction: systemPrompt,
    });

    // Build chat history (all but the last message)
    const history = messages.slice(0, -1).map((m: { role: string; content: string }) => ({
      role: m.role === "assistant" ? "model" : "user",
      parts: [{ text: m.content }],
    }));

    const chat = model.startChat({ history });

    const lastMessage = messages.length > 0 ? messages[messages.length - 1] : null;
    const userText = lastMessage?.role === "user" ? lastMessage.content : "試験を開始してください。最初の質問をしてください。";

    const result = await chat.sendMessage(userText);
    const text = result.response.text();

    return NextResponse.json({ message: text });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "Failed to get response" }, { status: 500 });
  }
}
