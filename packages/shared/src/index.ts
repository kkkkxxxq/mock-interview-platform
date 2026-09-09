export type Role = "backend" | "frontend" | "algorithm" | "product" | "data";

export const ROLE_LABELS: Record<Role, string> = {
  backend: "后端开发",
  frontend: "前端开发",
  algorithm: "算法",
  product: "产品经理",
  data: "数据分析"
};

export interface UserProfile {
  id: string;
  email: string;
  displayName: string;
  quotaLimit: number;
  quotaUsed: number;
}

export type CompanyId = string;

export interface Company {
  id: CompanyId;
  name: string;
  industry: string;
  techStack: string[];
  business: string;
  interviewFocus: string[];
}

export type TechRequirementId = string;

export interface TechRequirement {
  id: TechRequirementId;
  label: string;
}

export interface InterviewConfig {
  role: Role;
  companyId: CompanyId | null;
  techRequirements: TechRequirementId[];
  durationMinutes: number;
  questionCount: number;
}

export type ScoreDimension =
  | "technical_accuracy"
  | "logical_expression"
  | "communication_fluency"
  | "responsiveness"
  | "overall";

export interface DimensionScore {
  dimension: ScoreDimension;
  label: string;
  /** 0-100 */
  score: number;
  maxScore: number;
  comment: string;
}

export interface QuestionScore {
  questionIndex: number;
  question: string;
  answerTranscript: string;
  interviewerFeedback: string;
}

export type InterviewStatus =
  | "configuring"
  | "in_progress"
  | "complete"
  | "cancelled";

export interface Interview {
  id: string;
  userId: string;
  role: Role;
  companyId: CompanyId | null;
  companyName?: string;
  techRequirements: TechRequirementId[];
  status: InterviewStatus;
  startedAt: string;
  finishedAt: string | null;
  durationSeconds: number | null;
  questions: QuestionScore[];
  scores: DimensionScore[];
  knowledgeSummary: string;
  resumeReport?: ResumeReport;
}

export interface Recording {
  id: string;
  interviewId: string;
  orderIndex: number;
  url: string;
  durationSeconds: number;
  mimeType: string;
}

export interface ResumeReport {
  id: string;
  interviewId: string;
  rawContent: string;
  optimizedContent: string;
  improvements: string[];
  suggestions: string[];
  isEdited: boolean;
  updatedAt: string;
}

export interface UserProfile {
  id: string;
  email: string;
  displayName: string;
}