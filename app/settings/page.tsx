"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { loadSettings, saveSettings, ExamSettings } from "@/lib/store";

export default function SettingsPage() {
  const router = useRouter();
  const [settings, setSettings] = useState<ExamSettings>({
    theme: "",
    criteria: ["", "", ""],
  });
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    setSettings(loadSettings());
  }, []);

  const handleSave = () => {
    saveSettings(settings);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const setCriterion = (index: number, value: string) => {
    const updated = [...settings.criteria] as [string, string, string];
    updated[index] = value;
    setSettings({ ...settings, criteria: updated });
  };

  return (
    <div className="min-h-screen bg-gray-950 text-white flex flex-col">
      <header className="border-b border-gray-800 px-6 py-4 flex items-center justify-between">
        <button
          onClick={() => router.push("/")}
          className="text-gray-400 hover:text-white transition-colors flex items-center gap-2"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
          戻る
        </button>
        <h1 className="text-lg font-semibold">設定</h1>
        <div className="w-16" />
      </header>

      <main className="flex-1 max-w-2xl mx-auto w-full px-6 py-8 space-y-8">
        {/* Theme */}
        <section>
          <label className="block text-sm font-medium text-gray-300 mb-2">
            試問テーマ
          </label>
          <textarea
            value={settings.theme}
            onChange={(e) => setSettings({ ...settings, theme: e.target.value })}
            rows={3}
            placeholder="例: データ構造とアルゴリズムの基礎"
            className="w-full bg-gray-900 border border-gray-700 rounded-xl px-4 py-3 text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent resize-none"
          />
          <p className="mt-1 text-xs text-gray-500">
            試験官がこのテーマについて質問を行います
          </p>
        </section>

        {/* Criteria */}
        <section>
          <h2 className="text-sm font-medium text-gray-300 mb-4">
            評価基準 <span className="text-gray-500">（3項目）</span>
          </h2>
          <div className="space-y-3">
            {settings.criteria.map((criterion, index) => (
              <div key={index} className="flex items-center gap-3">
                <span className="w-8 h-8 flex items-center justify-center bg-indigo-900/50 text-indigo-400 rounded-full text-sm font-medium shrink-0">
                  {index + 1}
                </span>
                <input
                  type="text"
                  value={criterion}
                  onChange={(e) => setCriterion(index, e.target.value)}
                  placeholder={["理解度", "論理構成", "表現力"][index]}
                  className="flex-1 bg-gray-900 border border-gray-700 rounded-xl px-4 py-3 text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                />
              </div>
            ))}
          </div>
          <p className="mt-2 text-xs text-gray-500">
            試験終了後、これらの基準に基づいて100点満点で採点されます
          </p>
        </section>

        {/* Info box */}
        <div className="bg-indigo-950/40 border border-indigo-800/50 rounded-xl p-4 text-sm text-indigo-300">
          <div className="flex gap-2">
            <svg className="w-5 h-5 shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <div>
              <p className="font-medium mb-1">AI モデルについて</p>
              <p className="text-indigo-400">試験中・採点: Gemini 2.0 Flash（無料）</p>
              <p className="text-indigo-400">APIキー: Google AI Studio で無料取得</p>
            </div>
          </div>
        </div>

        {/* Save button */}
        <button
          onClick={handleSave}
          className="w-full bg-indigo-600 hover:bg-indigo-500 text-white font-medium py-3 rounded-xl transition-colors"
        >
          {saved ? "保存しました！" : "設定を保存"}
        </button>
      </main>
    </div>
  );
}
