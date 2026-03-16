"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { loadSettings, ExamSettings, DEFAULT_SETTINGS } from "@/lib/store";

export default function Home() {
  const router = useRouter();
  const [settings, setSettings] = useState<ExamSettings>(DEFAULT_SETTINGS);

  useEffect(() => {
    setSettings(loadSettings());
  }, []);

  return (
    <div className="min-h-screen bg-gray-950 text-white flex flex-col items-center justify-center px-4">
      <div className="w-full max-w-md space-y-8">
        {/* Logo / Hero */}
        <div className="text-center">
          <div className="w-20 h-20 bg-indigo-900/60 rounded-2xl flex items-center justify-center mx-auto mb-5 border border-indigo-800/50">
            <svg className="w-10 h-10 text-indigo-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01" />
            </svg>
          </div>
          <h1 className="text-3xl font-bold mb-2">口頭試問AI</h1>
          <p className="text-gray-400 text-sm">
            AIが試験官となり、あなたの理解度を評価します
          </p>
        </div>

        {/* Current settings preview */}
        <div className="bg-gray-900 rounded-2xl p-4 border border-gray-800 space-y-3">
          <div className="flex items-start gap-3">
            <div className="w-8 h-8 bg-indigo-900/50 rounded-lg flex items-center justify-center shrink-0">
              <svg className="w-4 h-4 text-indigo-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 8h10M7 12h4m1 8l-4-4H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-3l-4 4z" />
              </svg>
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs text-gray-500 mb-0.5">試問テーマ</p>
              <p className="text-sm text-gray-200 truncate">{settings.theme}</p>
            </div>
          </div>
          <div className="flex items-start gap-3">
            <div className="w-8 h-8 bg-indigo-900/50 rounded-lg flex items-center justify-center shrink-0">
              <svg className="w-4 h-4 text-indigo-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
              </svg>
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs text-gray-500 mb-0.5">評価基準</p>
              <p className="text-sm text-gray-200">
                {settings.criteria.filter(Boolean).join(" • ") || "未設定"}
              </p>
            </div>
          </div>
        </div>

        {/* How it works */}
        <div className="space-y-2">
          {[
            { icon: "🎤", label: "音声またはテキストで回答", sub: "Web Speech API（無料）" },
            { icon: "🤖", label: "AIが深掘り質問を繰り返す", sub: "試験中は正解を教えません" },
            { icon: "📊", label: "終了後に100点満点で採点", sub: "3つの評価軸で詳細分析" },
          ].map((item, i) => (
            <div key={i} className="flex items-center gap-3 text-sm">
              <span className="text-lg">{item.icon}</span>
              <div>
                <span className="text-gray-200">{item.label}</span>
                <span className="text-gray-500 text-xs ml-2">{item.sub}</span>
              </div>
            </div>
          ))}
        </div>

        {/* CTA buttons */}
        <div className="space-y-3">
          <button
            onClick={() => router.push("/exam")}
            className="w-full bg-indigo-600 hover:bg-indigo-500 text-white font-semibold py-4 rounded-2xl transition-colors text-lg"
          >
            試験を開始する
          </button>
          <button
            onClick={() => router.push("/settings")}
            className="w-full bg-gray-800 hover:bg-gray-700 text-gray-300 font-medium py-3 rounded-2xl transition-colors flex items-center justify-center gap-2"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
            テーマ・評価基準を設定
          </button>
        </div>

        <p className="text-center text-xs text-gray-600">
          ANTHROPIC_API_KEY が必要です
        </p>
      </div>
    </div>
  );
}
