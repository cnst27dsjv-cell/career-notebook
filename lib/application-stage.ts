export const schedulableApplicationStages = [
  "待投递",
  "测评",
  "笔试",
  "面试",
] as const;

export type SchedulableApplicationStage =
  (typeof schedulableApplicationStages)[number];

export const manuallyCompletableApplicationStages = [
  "测评",
  "笔试",
  "面试",
] as const;

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

export function isManuallyCompletableApplicationStage(stage: string) {
  return manuallyCompletableApplicationStages.includes(
    stage as (typeof manuallyCompletableApplicationStages)[number],
  );
}

export function automaticApplicationStageStatus(
  stage: string,
  options: {
    hasPendingEvent?: boolean;
    keepWaiting?: boolean;
    stageCompleted?: boolean;
  } = {},
) {
  if (stage === "已投递" || stage === "Offer") return "等待结果";
  if (options.stageCompleted && isManuallyCompletableApplicationStage(stage))
    return "等待结果";
  if (options.hasPendingEvent) return "待完成";
  if (options.keepWaiting) return "等待结果";
  return "待安排";
}

export function applicationStageStatusLabel(
  stage: string,
  stageStatus: string,
) {
  if (
    stageStatus === "等待结果" &&
    isManuallyCompletableApplicationStage(stage)
  )
    return stage === "面试" ? "已完成 · 等待结果" : "已完成 · 等待下一阶段";
  return stageStatus;
}
