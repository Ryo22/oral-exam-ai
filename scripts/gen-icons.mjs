// Generate PWA icons using Canvas API (Node.js built-in via canvas package)
// Simple approach: create PNG icons with indigo background + text

import { createCanvas } from "canvas";
import { writeFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const publicDir = join(__dirname, "../public");

function generateIcon(size) {
  const canvas = createCanvas(size, size);
  const ctx = canvas.getContext("2d");

  // Background
  ctx.fillStyle = "#1e1b4b"; // indigo-950
  ctx.fillRect(0, 0, size, size);

  // Rounded rect feel via inner square
  const padding = size * 0.15;
  const radius = size * 0.2;

  ctx.beginPath();
  ctx.roundRect(padding, padding, size - padding * 2, size - padding * 2, radius);
  ctx.fillStyle = "#3730a3"; // indigo-700
  ctx.fill();

  // Text: 試 (kanji)
  ctx.fillStyle = "#c7d2fe"; // indigo-200
  ctx.font = `bold ${size * 0.42}px sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText("試", size / 2, size / 2 + size * 0.02);

  return canvas.toBuffer("image/png");
}

try {
  writeFileSync(join(publicDir, "icon-192.png"), generateIcon(192));
  writeFileSync(join(publicDir, "icon-512.png"), generateIcon(512));
  console.log("Icons generated successfully");
} catch (e) {
  console.error("canvas package not available, skipping icon generation:", e.message);
}
