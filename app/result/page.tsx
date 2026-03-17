"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { loadResult, loadSession, clearSession, ScoreResult } from "@/lib/store";

function ScoreBar({ score, max = 33 }: { score: number; max?: number }) {
  const pct = Math.min(100, (score / max) * 100);
  const color =
    pct >= 80 ? "bg-emerald-500" : pct >= 60 ? "bg-yellow-500" : pct >= 40 ? "bg-orange-500" : "bg-red-500";

  return (
    <div className="w-full bg-gray-800 rounded-full h-2.5 overflow-hidden">
      <div
        className={`h-full rounded-full transition-all duration-1000 ${color}`}
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}

function TotalScoreCircle({ score }: { score: number }) {
  const color =
    score >= 80 ? "text-emerald-400" : score >= 60 ? "text-yellow-400" : score >= 40 ? "text-orange-400" : "text-red-400";
  const grade =
    score >= 90 ? "A+" : score >= 80 ? "A" : score >= 70 ? "B" : score >= 60 ? "C" : score >= 50 ? "D" : "F";

  return (
    <div className="flex flex-col items-center">
      <div className={`text-7xl font-bold tabular-nums ${color}`}>{score}</div>
      <div className="text-gray-400 text-sm mt-1">/ 100点</div>
      <div className={`text-2xl font-bold mt-2 ${color}`}>{grade}</div>
    </div>
  );
}

export default function ResultPage() {
  const router = useRouter();
  const [result, setResult] = useState<ScoreResult | null>(null);
  const [session, setSession] = useState<ReturnType<typeof loadSession>>(null);
  const [showLog, setShowLog] = useState(false);

  useEffect(() => {
    const r = loadResult();
    const s = loadSession();
    if (!r) {
      router.replace("/");
      return;
    }
    setResult(r);
    setSession(s);
  }, [router]);

  const handleRetry = () => {
    clearSession();
    router.push("/exam");
  };

  if (!result) return null;

  return (
    <div className="min-h-screen bg-gray-950 text-white flex flex-col">
      {/* Header */}
      <header className="border-b border-gray-800 px-4 py-3 flex items-center justify-between">
        <button
          onClick={() => router.push("/")}
          className="text-gray-400 hover:text-white transition-colors text-sm flex items-center gap-1"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
          </svg>
          ホーム
        </button>
        <h1 className="text-base font-semibold">採点結果</h1>
        <div className="w-16" />
      </header>

      <main className="flex-1 max-w-2xl mx-auto w-full px-4 py-6 space-y-6">
        {/* Total score card */}
        <div className="bg-gray-900 rounded-2xl p-6 text-center border border-gray-800">
          <p className="text-sm text-gray-400 mb-4">
            {session?.settings.theme || "口頭試問"}
          </p>
          <TotalScoreCircle score={result.totalScore} />
          <p className="mt-4 text-sm text-gray-300 leading-relaxed">
            {result.overallComment}
          </p>
        </div>

        {/* Criteria breakdown */}
        <div className="space-y-3">
          <h2 className="text-sm font-medium text-gray-400 px-1">評価詳細</h2>
          {result.criteria.map((c, i) => (
            <div key={i} className="bg-gray-900 rounded-xl p-4 border border-gray-800">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium">{c.name}</span>
                <span className="text-sm font-bold tabular-nums">
                  <span
                    className={
                      c.score >= 27 ? "text-emerald-400" :
                      c.score >= 20 ? "text-yellow-400" :
                      c.score >= 13 ? "text-orange-400" : "text-red-400"
                    }
                  >
                    {c.score}
                  </span>
                  <span className="text-gray-500"> / 33</span>
                </span>
              </div>
              <ScoreBar score={c.score} max={33} />
              <p className="mt-2 text-xs text-gray-400 leading-relaxed">{c.comment}</p>
            </div>
          ))}
        </div>

        {/* Improvements */}
        {result.improvements && result.improvements.length > 0 && (
          <div className="bg-gray-900 rounded-xl p-4 border border-gray-800">
            <h2 className="text-sm font-medium text-gray-300 mb-3 flex items-center gap-2">
              <svg className="w-4 h-4 text-yellow-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
              </svg>
              改善アドバイス
            </h2>
            <ul className="space-y-2">
              {result.improvements.map((imp, i) => (
                <li key={i} className="flex gap-2 text-sm text-gray-300">
                  <span className="text-indigo-400 shrink-0">•</span>
                  {imp}
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Conversation log toggle */}
        {session && session.messages.length > 0 && (
          <div className="bg-gray-900 rounded-xl border border-gray-800 overflow-hidden">
            <button
              onClick={() => setShowLog(!showLog)}
              className="w-full flex items-center justify-between px-4 py-3 text-sm text-gray-300 hover:text-white transition-colors"
            >
              <span>試問ログ ({session.messages.length} メッセージ)</span>
              <svg
                className={`w-4 h-4 transition-transform ${showLog ? "rotate-180" : ""}`}
                fill="none" stroke="currentColor" viewBox="0 0 24 24"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </button>
            {showLog && (
              <div className="px-4 pb-4 space-y-3 border-t border-gray-800 pt-3">
                {session.messages.map((msg, i) => (
                  <div key={i} className={`flex gap-2 ${msg.role === "user" ? "flex-row-reverse" : ""}`}>
                    <div
                      className={`w-6 h-6 rounded-full flex items-center justify-center text-xs shrink-0 ${
                        msg.role === "assistant" ? "bg-indigo-800" : "bg-gray-700"
                      }`}
                    >
                      {msg.role === "assistant" ? "試" : "私"}
                    </div>
                    <div
                      className={`text-xs leading-relaxed px-3 py-2 rounded-xl max-w-[85%] ${
                        msg.role === "assistant"
                          ? "bg-gray-800 text-gray-300"
                          : "bg-indigo-900/60 text-indigo-100"
                      }`}
                    >
                      {msg.content}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Actions */}
        <div className="flex gap-3 pb-6">
          <button
            onClick={handleRetry}
            className="flex-1 bg-indigo-600 hover:bg-indigo-500 text-white font-medium py-3 rounded-xl transition-colors"
          >
            もう一度試験する
          </button>
          <button
            onClick={() => router.push("/settings")}
            className="flex-1 bg-gray-800 hover:bg-gray-700 text-gray-300 font-medium py-3 rounded-xl transition-colors"
          >
            設定を変更
          </button>
        </div>
      </main>
    </div>
  );
}
