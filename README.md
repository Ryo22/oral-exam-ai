# 口頭試問AI

AIが試験官となり、受験者の理解度を口頭試問形式で評価するスタンドアロン Web アプリです。

## 使い方

`index.html` を直接ブラウザで開くか、GitHub Pages 経由でアクセスしてください。

**ライブURL**: https://ryo22.github.io/oral-exam-ai/

## 主な機能

- Gemini API（Google AI Studio）を使ったAI試験官
- テーマ・評価基準・問題リストのカスタマイズ
- 問題数・難易度内訳の指定（AI自動出題）
- 複数テスト管理・複数クラス管理
- 採点結果の公開・学生マイページ（会話ログ閲覧含む）
- 不正行為対策（フォーカス離脱検知）
- CSV/Excel で問題リストの入出力

## 技術スタック

- Alpine.js 3.x（リアクティブ状態管理）
- Tailwind CSS CDN（Google Classroomスタイル）
- Quill.js（リッチテキストエディタ）
- PapaParse / SheetJS（CSV・Excel処理）
- Google Gemini API
