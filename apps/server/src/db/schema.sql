-- 模拟面试平台 - 数据库 schema
-- psql postgres://mock:mock@localhost:5432/mock_interview -f apps/server/src/db/schema.sql

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  display_name TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 简历文件解析结果（PDF / Word 上传后）
ALTER TABLE users ADD COLUMN IF NOT EXISTS resume_text TEXT DEFAULT '';
ALTER TABLE users ADD COLUMN IF NOT EXISTS resume_file_name TEXT DEFAULT '';
ALTER TABLE users ADD COLUMN IF NOT EXISTS resume_uploaded_at TIMESTAMPTZ;

-- 需求补齐：准入与使用次数管理（每日配额）
ALTER TABLE users ADD COLUMN IF NOT EXISTS quota_limit INT NOT NULL DEFAULT 5;
ALTER TABLE users ADD COLUMN IF NOT EXISTS quota_date DATE;
ALTER TABLE users ADD COLUMN IF NOT EXISTS quota_used INT NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS interviews (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role TEXT NOT NULL,
  company_id TEXT,
  company_name TEXT,
  tech_requirements TEXT[] NOT NULL DEFAULT '{}',
  status TEXT NOT NULL DEFAULT 'in_progress',
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  finished_at TIMESTAMPTZ,
  duration_seconds INT,
  question_count INT NOT NULL DEFAULT 5,
  current_question_index INT NOT NULL DEFAULT 0,
  summary TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 需求 V4：题量不限 + JD 粘贴
ALTER TABLE interviews ADD COLUMN IF NOT EXISTS unlimited BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE interviews ADD COLUMN IF NOT EXISTS jd_text TEXT DEFAULT '';

CREATE TABLE IF NOT EXISTS interview_questions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  interview_id UUID NOT NULL REFERENCES interviews(id) ON DELETE CASCADE,
  question_index INT NOT NULL,
  question TEXT NOT NULL,
  answer_transcript TEXT,
  interviewer_feedback TEXT,
  sample_answer TEXT DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS scores (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  interview_id UUID NOT NULL REFERENCES interviews(id) ON DELETE CASCADE,
  dimension TEXT NOT NULL,
  label TEXT NOT NULL,
  score INT NOT NULL,
  max_score INT NOT NULL DEFAULT 100,
  comment TEXT,
  UNIQUE (interview_id, dimension)
);

CREATE TABLE IF NOT EXISTS recordings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  interview_id UUID NOT NULL REFERENCES interviews(id) ON DELETE CASCADE,
  question_index INT NOT NULL,
  s3_key TEXT NOT NULL,
  url TEXT,
  duration_seconds INT,
  mime_type TEXT NOT NULL DEFAULT 'video/webm',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS resume_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  interview_id UUID NOT NULL REFERENCES interviews(id) ON DELETE CASCADE UNIQUE,
  raw_content TEXT DEFAULT '',
  optimized_content TEXT DEFAULT '',
  improvements TEXT[] NOT NULL DEFAULT '{}',
  suggestions TEXT[] NOT NULL DEFAULT '{}',
  is_edited BOOLEAN NOT NULL DEFAULT false,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 对话逐字稿：每个可见文本（AI 提问/点评、用户作答、系统收尾）一行
CREATE TABLE IF NOT EXISTS interview_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  interview_id UUID NOT NULL REFERENCES interviews(id) ON DELETE CASCADE,
  seq INT NOT NULL,
  speaker TEXT NOT NULL DEFAULT 'ai',      -- ai | user | system
  role_name TEXT,                          -- 例如 question / followup / answer / notice
  content TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (interview_id, seq)
);

CREATE INDEX IF NOT EXISTS idx_logs_interview ON interview_logs(interview_id);

CREATE INDEX IF NOT EXISTS idx_interviews_user ON interviews(user_id);
CREATE INDEX IF NOT EXISTS idx_questions_interview ON interview_questions(interview_id);
CREATE INDEX IF NOT EXISTS idx_scores_interview ON scores(interview_id);
CREATE INDEX IF NOT EXISTS idx_recordings_interview ON recordings(interview_id);

-- 需求 V4：每题优秀示范作答（评分模型可回填）
ALTER TABLE interview_questions ADD COLUMN IF NOT EXISTS sample_answer TEXT DEFAULT '';

-- 需求评分整改：每题作答质量（0=未作答/跑题 1=严重偏离 2=部分正确 3=基本完整 4=接近示范）
ALTER TABLE interview_questions ADD COLUMN IF NOT EXISTS quality INT DEFAULT NULL;