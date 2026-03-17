export interface Message {
  role: "user" | "assistant";
  content: string;
}

export interface CriterionResult {
  name: string;
  score: number;
  comment: string;
}

export interface ScoreResult {
  totalScore: number;
  criteria: CriterionResult[];
  overallComment: string;
  improvements: string[];
}

export interface ExamSettings {
  theme: string;
  criteria: [string, string, string];
}

export const DEFAULT_SETTINGS: ExamSettings = {
  theme: "データ構造とアルゴリズムの基礎",
  criteria: ["理解度", "論理構成", "表現力"],
};

const SETTINGS_KEY = "oral-exam-settings";
const SESSION_KEY = "oral-exam-session";

export function loadSettings(): ExamSettings {
  if (typeof window === "undefined") return DEFAULT_SETTINGS;
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    return raw ? JSON.parse(raw) : DEFAULT_SETTINGS;
  } catch {
    return DEFAULT_SETTINGS;
  }
}

export function saveSettings(settings: ExamSettings) {
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
}

export function loadSession(): { messages: Message[]; settings: ExamSettings } | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(SESSION_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function saveSession(messages: Message[], settings: ExamSettings) {
  sessionStorage.setItem(SESSION_KEY, JSON.stringify({ messages, settings }));
}

export function clearSession() {
  if (typeof window !== "undefined") {
    sessionStorage.removeItem(SESSION_KEY);
  }
}

export function saveResult(result: ScoreResult) {
  if (typeof window !== "undefined") {
    sessionStorage.setItem("oral-exam-result", JSON.stringify(result));
  }
}

export function loadResult(): ScoreResult | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = sessionStorage.getItem("oral-exam-result");
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}
