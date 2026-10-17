import {
  applicationStageStatusLabel,
  isManuallyCompletableApplicationStage,
} from "./application-stage";
import { stages, type Application } from "./types";

type ProgressState = "done" | "current" | "past" | "unrecorded" | "future";
export function applicationProgress(
  application: Pick<
    Application,
    "stage" | "stageStatus" | "outcome" | "history" | "appliedAt"
  >,
) {
  const currentIndex = stages.indexOf(application.stage);
  const history = new Map<string, string>();
  for (const entry of application.history || []) {
    for (const value of [entry.from, entry.to]) {
      const [stage, status] = value.split(" · ");
      if (stages.includes(stage)) history.set(stage, status || "");
    }
  }
  const ended = Boolean(application.outcome);
  const steps = stages.map((stage, index) => {
    const current = index === currentIndex;
    let state: ProgressState = "future";
    if (current) {
      state =
        (isManuallyCompletableApplicationStage(stage) &&
          application.stageStatus === "等待结果") ||
        stage === "已投递" ||
        (stage === "Offer" && application.outcome === "录用已接受")
          ? "done"
          : "current";
    } else if (index < currentIndex) {
      state =
        index <= 1 || history.get(stage) === "等待结果"
          ? "done"
          : history.has(stage)
            ? "past"
            : "unrecorded";
    }
    const applied =
      stage === "已投递" && application.appliedAt
        ? new Date(application.appliedAt)
        : null;
    const date =
      applied && !Number.isNaN(applied.getTime())
        ? new Intl.DateTimeFormat("en-US", {
            timeZone: "Asia/Shanghai",
            month: "2-digit",
            day: "2-digit",
          }).format(applied)
        : "";
    return { stage, current, state, date };
  });
  return {
    steps,
    ended,
    summary: `${application.stage} · ${application.outcome || applicationStageStatusLabel(application.stage, application.stageStatus)}`,
  };
}
