"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useSpeech } from "@/hooks/useSpeech";
import {
  Message,
  loadSettings,
  saveSession,
  saveResult,
  ExamSettings,
} from "@/lib/store";

export default function ExamPage() {
  const router = useRouter();
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputText, setInputText] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isScoring, setIsScoring] = useState(false);
  const [settings, setSettings] = useState<ExamSettings | null>(null);
  const [examStarted, setExamStarted] = useState(false);
  const [autoSpeak, setAutoSpeak] = useState(true);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const handleTranscript = useCallback((text: string) => {
    setInputText((prev) => prev + text);
  }, []);

  const { isListening, isSpeaking, isSupported, startListening, stopListening, speak, stopSpeaking } =
    useSpeech({ onTranscript: handleTranscript });

  useEffect(() => {
    setSettings(loadSettings());
  }, []);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const sendToExaminer = useCallback(
    async (userMessage: string, currentMessages: Message[]) => {
      if (!settings) return;
      setIsLoading(true);

      const updatedMessages: Message[] = [
        ...currentMessages,
        { role: "user", content: userMessage },
      ];
      setMessages(updatedMessages);

      try {
        const res = await fetch("/api/examine", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            messages: updatedMessages,
            theme: settings.theme,
            criteria: settings.criteria,
          }),
        });

        const data = await res.json();
        if (data.message) {
          const finalMessages: Message[] = [
            ...updatedMessages,
            { role: "assistant", content: data.message },
          ];
          setMessages(finalMessages);
          saveSession(finalMessages, settings);
          if (autoSpeak) speak(data.message);
        }
      } catch (err) {
        console.error(err);
      } finally {
        setIsLoading(false);
      }
    },
    [settings, autoSpeak, speak]
  );

  const handleStartExam = useCallback(async () => {
    if (!settings) return;
    setExamStarted(true);
    setIsLoading(true);

    try {
      const res = await fetch("/api/examine", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: [],
          theme: settings.theme,
          criteria: settings.criteria,
        }),
      });

      const data = await res.json();
      if (data.message) {
        const initialMessages: Message[] = [
          { role: "assistant", content: data.message },
        ];
        setMessages(initialMessages);
        saveSession(initialMessages, settings);
        if (autoSpeak) speak(data.message);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setIsLoading(false);
    }
  }, [settings, autoSpeak, speak]);

  const handleSend = useCallback(async () => {
    if (!inputText.trim() || isLoading) return;
    const text = inputText.trim();
    setInputText("");
    await sendToExaminer(text, messages);
  }, [inputText, isLoading, messages, sendToExaminer]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleEndExam = async () => {
    if (!settings || messages.length < 2) return;
    if (!confirm("試験を終了して採点しますか？")) return;

    setIsScoring(true);
    stopSpeaking();

    try {
      const res = await fetch("/api/score", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages,
          theme: settings.theme,
          criteria: settings.criteria,
        }),
      });

      const data = await res.json();
      if (!data.error) {
        saveResult(data);
        router.push("/result");
      }
    } catch (err) {
      console.error(err);
      alert("採点に失敗しました。もう一度お試しください。");
    } finally {
      setIsScoring(false);
    }
  };

  if (!settings) return null;

  return (
    <div className="min-h-screen bg-gray-950 text-white flex flex-col">
      {/* Header */}
      <header className="border-b border-gray-800 px-4 py-3 flex items-center justify-between bg-gray-900/50 backdrop-blur">
        <button
          onClick={() => router.push("/")}
          className="text-gray-400 hover:text-white transition-colors"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
        </button>
        <div className="text-center">
          <div className="text-sm font-medium truncate max-w-48">{settings.theme}</div>
          <div className="text-xs text-gray-500">{messages.filter(m => m.role === "user").length} 回答済み</div>
        </div>
        <button
          onClick={handleEndExam}
          disabled={!examStarted || messages.length < 2 || isScoring}
          className="text-sm bg-red-900/60 hover:bg-red-800/80 text-red-300 px-3 py-1.5 rounded-lg transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {isScoring ? "採点中..." : "試験終了"}
        </button>
      </header>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
        {!examStarted ? (
          <div className="flex flex-col items-center justify-center h-full py-20 text-center">
            <div className="w-20 h-20 bg-indigo-900/40 rounded-full flex items-center justify-center mb-6">
              <svg className="w-10 h-10 text-indigo-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
              </svg>
            </div>
            <h2 className="text-xl font-semibold mb-2">口頭試問を開始</h2>
            <p className="text-gray-400 text-sm mb-2">テーマ: {settings.theme}</p>
            <p className="text-gray-500 text-xs mb-8">
              試験中は正解・解説は教えません。自分の言葉で答えてください。
            </p>
            <button
              onClick={handleStartExam}
              className="bg-indigo-600 hover:bg-indigo-500 text-white font-medium px-8 py-3 rounded-xl transition-colors"
            >
              試験開始
            </button>
          </div>
        ) : (
          <>
            {messages.map((msg, i) => (
              <div
                key={i}
                className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
              >
                {msg.role === "assistant" && (
                  <div className="w-8 h-8 bg-indigo-800 rounded-full flex items-center justify-center text-xs font-medium mr-2 shrink-0 mt-1">
                    試
                  </div>
                )}
                <div
                  className={`max-w-[80%] rounded-2xl px-4 py-3 text-sm leading-relaxed ${
                    msg.role === "user"
                      ? "bg-indigo-600 text-white rounded-br-sm"
                      : "bg-gray-800 text-gray-100 rounded-bl-sm"
                  }`}
                >
                  {msg.content}
                </div>
                {msg.role === "user" && (
                  <div className="w-8 h-8 bg-gray-700 rounded-full flex items-center justify-center text-xs font-medium ml-2 shrink-0 mt-1">
                    私
                  </div>
                )}
              </div>
            ))}
            {isLoading && (
              <div className="flex justify-start">
                <div className="w-8 h-8 bg-indigo-800 rounded-full flex items-center justify-center text-xs font-medium mr-2 shrink-0">
                  試
                </div>
                <div className="bg-gray-800 rounded-2xl rounded-bl-sm px-4 py-3">
                  <div className="flex gap-1">
                    <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: "0ms" }} />
                    <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: "150ms" }} />
                    <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: "300ms" }} />
                  </div>
                </div>
              </div>
            )}
          </>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input area */}
      {examStarted && (
        <div className="border-t border-gray-800 bg-gray-900/80 backdrop-blur px-4 py-3">
          {/* Auto-speak toggle + TTS controls */}
          <div className="flex items-center justify-between mb-2 px-1">
            <label className="flex items-center gap-2 text-xs text-gray-500 cursor-pointer">
              <div
                onClick={() => setAutoSpeak(!autoSpeak)}
                className={`w-8 h-4 rounded-full transition-colors relative ${autoSpeak ? "bg-indigo-600" : "bg-gray-700"}`}
              >
                <div className={`w-3 h-3 bg-white rounded-full absolute top-0.5 transition-transform ${autoSpeak ? "translate-x-4" : "translate-x-0.5"}`} />
              </div>
              音声読み上げ
            </label>
            {isSpeaking && (
              <button
                onClick={stopSpeaking}
                className="text-xs text-yellow-400 hover:text-yellow-300 flex items-center gap-1"
              >
                <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8 7a1 1 0 00-1 1v4a1 1 0 001 1h4a1 1 0 001-1V8a1 1 0 00-1-1H8z" clipRule="evenodd" />
                </svg>
                読み上げ停止
              </button>
            )}
          </div>

          <div className="flex gap-2 items-end">
            <textarea
              ref={textareaRef}
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="回答を入力..."
              rows={2}
              className="flex-1 bg-gray-800 border border-gray-700 rounded-xl px-3 py-2.5 text-sm text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent resize-none"
            />

            {/* Voice input button */}
            {isSupported && (
              <button
                onClick={isListening ? stopListening : startListening}
                disabled={isLoading}
                className={`w-11 h-11 rounded-xl flex items-center justify-center transition-colors shrink-0 ${
                  isListening
                    ? "bg-red-600 hover:bg-red-500 animate-pulse"
                    : "bg-gray-700 hover:bg-gray-600"
                }`}
                title={isListening ? "録音停止" : "音声入力"}
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  {isListening ? (
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0zM9 10a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1h-4a1 1 0 01-1-1v-4z" />
                  ) : (
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
                  )}
                </svg>
              </button>
            )}

            {/* Send button */}
            <button
              onClick={handleSend}
              disabled={!inputText.trim() || isLoading}
              className="w-11 h-11 bg-indigo-600 hover:bg-indigo-500 disabled:bg-gray-700 disabled:cursor-not-allowed rounded-xl flex items-center justify-center transition-colors shrink-0"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
              </svg>
            </button>
          </div>
        </div>
      )}

      {isScoring && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50">
          <div className="bg-gray-900 border border-gray-700 rounded-2xl p-8 text-center max-w-sm mx-4">
            <div className="w-16 h-16 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
            <p className="text-lg font-medium mb-1">採点中...</p>
            <p className="text-sm text-gray-400">Claude Opus が試問記録を詳細分析しています</p>
          </div>
        </div>
      )}
    </div>
  );
}
