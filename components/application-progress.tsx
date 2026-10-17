import type { Application } from "@/lib/types";
import { applicationProgress } from "@/lib/application-progress";

const labels = {
  done: "已完成",
  current: "当前阶段",
  past: "已历经",
  unrecorded: "未记录",
  future: "未开始",
};
export default function ApplicationProgress({
  application,
}: {
  application: Application;
}) {
  const progress = applicationProgress(application);
  return (
    <div className={`application-progress${progress.ended ? " is-ended" : ""}`}>
      <ol aria-label={`${application.company}投递进度`}>
        {progress.steps.map((step) => (
          <li
            key={step.stage}
            className={`progress-step is-${step.state}${step.current ? " is-current" : ""}`}
            aria-current={step.current ? "step" : undefined}
            title={`${step.stage}：${labels[step.state]}${step.date ? ` · 投递于 ${step.date}` : ""}`}
          >
            <span className="progress-dot" aria-hidden="true">
              {step.state === "done" ? "✓" : ""}
            </span>
            <span className="progress-stage">{step.stage}</span>
            <span className="progress-note">
              {step.date ||
                (step.state === "unrecorded"
                  ? "未记录"
                  : step.state === "past"
                    ? "已历经"
                    : "")}
            </span>
            <span className="sr-only">{labels[step.state]}</span>
          </li>
        ))}
      </ol>
      <p className="progress-summary">{progress.summary}</p>
    </div>
  );
}
