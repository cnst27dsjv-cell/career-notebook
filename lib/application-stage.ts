export const schedulableApplicationStages = [
  "待投递",
  "测评",
  "笔试",
  "面试",
] as const;

export type SchedulableApplicationStage =
  (typeof schedulableApplicationStages)[number];

const stageToKind: Record<SchedulableApplicationStage, string> = {
  待投递: "投递",
  测评: "测评",
  笔试: "笔试",
  面试: "面试",
};

export function eventKindForApplicationStage(stage: string) {
  return stageToKind[stage as SchedulableApplicationStage] || null;
}

export function applicationStageForEventKind(kind: string) {
  if (kind === "投递") return "待投递";
  return ["测评", "笔试", "面试"].includes(kind) ? kind : null;
}

export function completedApplicationStageForEventKind(kind: string) {
  return kind === "投递" ? "已投递" : applicationStageForEventKind(kind);
}

export function automaticApplicationStageStatus(
  stage: string,
  options: { hasPendingEvent?: boolean; keepWaiting?: boolean } = {},
) {
  if (stage === "已投递" || stage === "Offer") return "等待结果";
  if (options.hasPendingEvent) return "待完成";
  if (options.keepWaiting) return "等待结果";
  return "待安排";
}
