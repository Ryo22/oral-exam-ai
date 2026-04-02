-- ============================================================
-- oral-exam-ai Supabase Schema
-- 新しい Supabase プロジェクトの SQL エディタで実行してください
-- ============================================================

-- 1. app_settings (アプリ設定)
CREATE TABLE IF NOT EXISTS public.app_settings (
  key   text PRIMARY KEY,
  value text
);

-- 2. user_roles (ユーザー権限)
CREATE TABLE IF NOT EXISTS public.user_roles (
  user_id  uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  role     text NOT NULL DEFAULT 'student',
  is_admin boolean NOT NULL DEFAULT false
);

-- 3. authorized_emails (教員認可メール)
CREATE TABLE IF NOT EXISTS public.authorized_emails (
  email text PRIMARY KEY,
  role  text NOT NULL DEFAULT 'teacher'
);

-- 4. classes (クラス)
CREATE TABLE IF NOT EXISTS public.classes (
  id         text PRIMARY KEY,
  name       text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- 5. tests (テスト定義)
CREATE TABLE IF NOT EXISTS public.tests (
  id         text PRIMARY KEY,
  name       text NOT NULL,
  class_id   text,
  class_ids  jsonb,
  status     text NOT NULL DEFAULT 'draft',
  settings   jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- 6. exam_results (試験結果)
CREATE TABLE IF NOT EXISTS public.exam_results (
  id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  test_id                 text,
  test_name               text,
  class_id                text,
  student_name            text,
  student_email           text,
  theme                   text,
  date                    timestamptz NOT NULL DEFAULT now(),
  published               boolean NOT NULL DEFAULT false,
  total_score             numeric,
  criteria                jsonb,
  question_scores         jsonb,
  overall_comment         text,
  improvements            jsonb,
  ai_score                jsonb,
  admin_score             jsonb,
  focus_violation_count   integer NOT NULL DEFAULT 0,
  focus_violation_flagged boolean NOT NULL DEFAULT false,
  focus_violations        jsonb,
  conversation_log        jsonb,
  created_at              timestamptz NOT NULL DEFAULT now()
);

-- 7. roster (生徒名簿)
CREATE TABLE IF NOT EXISTS public.roster (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  class_id       text,
  student_number text,
  name           text NOT NULL,
  email          text,
  created_at     timestamptz NOT NULL DEFAULT now()
);

-- ============================================================
-- Row Level Security (RLS) の有効化
-- ============================================================

ALTER TABLE public.app_settings     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_roles       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.authorized_emails ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.classes          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tests            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.exam_results     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.roster           ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- RLS ポリシー
-- ※ anon ロールからの読み書きを許可（フロントエンドから直接接続するため）
-- ※ 本番環境ではより厳格なポリシーを検討してください
-- ============================================================

-- app_settings: 認証済みユーザーは読み書き可
CREATE POLICY "auth users can read app_settings"
  ON public.app_settings FOR SELECT TO authenticated USING (true);
CREATE POLICY "auth users can upsert app_settings"
  ON public.app_settings FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "auth users can update app_settings"
  ON public.app_settings FOR UPDATE TO authenticated USING (true);

-- user_roles: 認証済みユーザーは読み取り可、自分のレコードのみ書き込み
CREATE POLICY "users can read all roles"
  ON public.user_roles FOR SELECT TO authenticated USING (true);
CREATE POLICY "users can insert own role"
  ON public.user_roles FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
CREATE POLICY "users can update own role"
  ON public.user_roles FOR UPDATE TO authenticated USING (user_id = auth.uid());

-- authorized_emails: 認証済みユーザーは読み取り可
CREATE POLICY "auth users can read authorized_emails"
  ON public.authorized_emails FOR SELECT TO authenticated USING (true);
CREATE POLICY "auth users can manage authorized_emails"
  ON public.authorized_emails FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- classes: 全認証済みユーザーが読み書き可
CREATE POLICY "auth users can manage classes"
  ON public.classes FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- tests: 全認証済みユーザーが読み書き可
CREATE POLICY "auth users can manage tests"
  ON public.tests FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- exam_results: 全認証済みユーザーが読み書き可
CREATE POLICY "auth users can manage exam_results"
  ON public.exam_results FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- roster: 全認証済みユーザーが読み書き可
CREATE POLICY "auth users can manage roster"
  ON public.roster FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ============================================================
-- Realtime の有効化
-- ============================================================

ALTER PUBLICATION supabase_realtime ADD TABLE public.tests;
ALTER PUBLICATION supabase_realtime ADD TABLE public.exam_results;
