export type Application = {
  id: string;
  company: string;
  role: string;
  city: string;
  batch: string;
  stage: string;
  stageStatus: string;
  outcome: string;
  appliedAt: string | null;
  url: string;
  notes: string;
  resumeId: string | null;
  version: number;
  history: { at: string; from: string; to: string }[];
  updatedAt: string;
};
export type Event = {
  id: string;
  applicationId: string | null;
  title: string;
  kind: string;
  start: string | null;
  end: string | null;
  deadline: string | null;
  status: string;
  location: string;
  notes: string;
  reminderHours: number[];
  absoluteReminders: string[];
  version: number;
};
export type Resume = {
  id: string;
  series: string;
  number: number;
  fileId: string;
  target: string;
  notes: string;
  current: boolean;
  archived: boolean;
  createdAt: string;
};
export type Prep = {
  id: string;
  company: string;
  role: string;
  round: string;
  jd: string;
  applicationId: string | null;
  eventId: string | null;
  resumeId: string | null;
};
export type Material = {
  id: string;
  preparationId: string | null;
  title: string;
  kind: string;
  content: string;
  tags: string;
  source: string;
  parentId: string | null;
  revisions: { content: string; at: string }[];
  version: number;
  archived: boolean;
};
export type Source = {
  id: string;
  title: string;
  url: string;
  description: string;
  published: string;
  retrievedAt: string;
  kind: string;
};
export type Question = { question: string; sourceIds: string[]; basis: string };
export type Turn = {
  answer: string;
  suggestion?: string;
  feedback?: string;
  confirmed?: boolean;
};
export type Interview = {
  id: string;
  preparationId: string;
  questions: Question[];
  sources: Source[];
  turns: Turn[];
  version: number;
};
export type Data = {
  applications: Application[];
  events: Event[];
  resumes: Resume[];
  preparations: Prep[];
  materials: Material[];
  interviews: Interview[];
  files: { id: string; name: string; size: number }[];
  settings: {
    email: string;
    emailVerified: boolean;
    availabilityConfirmed: boolean;
    availability: { weekdays: number[]; weekends: number[] };
  };
  jobs: {
    id: string;
    eventId: string;
    state: string;
    scheduledAt: string;
    lastError: string;
  }[];
  services: {
    model: boolean;
    search: boolean;
    mailMode: string;
    worker: string | null;
  };
  user: { name: string; email: string };
};
export const stages = ["待投递", "已投递", "测评", "笔试", "面试", "Offer"];
export const outcomes = ["未通过", "主动撤回", "录用已接受", "录用已拒绝"];
export const kinds = ["招聘会", "投递", "测评", "笔试", "面试", "准备", "其他"];
