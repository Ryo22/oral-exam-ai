import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "口頭試問AI",
  description: "AIが試験官となり、あなたの理解度を音声で評価する口頭試問アプリ",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ja">
      <body className="antialiased font-sans">
        {children}
      </body>
    </html>
  );
}
