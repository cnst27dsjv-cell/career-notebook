"use client";
import { useMemo, useState } from "react";
import {
  MagnifyingGlass,
  FunnelSimple,
  ArrowUpRight,
  X,
  Download,
} from "@phosphor-icons/react";
import { useWorkspace, dateLabel } from "./context";
import { ApplicationForm } from "./forms";
import { AddButton, Empty } from "./ui";
import { filterApplications } from "@/lib/rules";
import type { Application } from "@/lib/types";
const fields = [
  ["company", "公司"],
  ["city", "城市"],
  ["role", "岗位"],
  ["stage", "阶段"],
  ["batch", "批次"],
  ["stageStatus", "阶段状态"],
  ["outcome", "结果"],
];
export default function Applications() {
  const { data } = useWorkspace();
  const [edit, setEdit] = useState<Application | true | undefined>(() => {
    const id =
      typeof window !== "undefined"
        ? new URLSearchParams(window.location.search).get("record")
        : null;
    return data.applications.find((item) => item.id === id);
  });
  const [q, setQ] = useState("");
  const [filters, setFilters] = useState<Record<string, string[]>>({});
  const [sort, setSort] = useState("updated");
  const [page, setPage] = useState(1);
  const rows = useMemo(() => {
    const items = filterApplications(data.applications, filters, q);
    return sort === "company"
      ? items.sort((a, b) => a.company.localeCompare(b.company, "zh-CN"))
      : items;
  }, [data.applications, filters, q, sort]);
  const toggle = (field: string, v: string) => {
    setFilters((f) => ({
      ...f,
      [field]: (f[field] || []).includes(v)
        ? f[field].filter((s) => s !== v)
        : [...(f[field] || []), v],
    }));
    setPage(1);
  };
  return (
    <>
      <div className="page-heading">
        <div>
          <h1>
            投递记录 <span className="script">My Applications</span>
          </h1>
          <p>每一个认真投出的机会，都值得被好好记录。</p>
        </div>
        <AddButton onClick={() => setEdit(true)}>新增投递</AddButton>
      </div>
      <section className="paper-panel">
        <div className="filter-toolbar">
          <label className="search-box">
            <MagnifyingGlass size={19} />
            <input
              aria-label="搜索公司或岗位"
              placeholder="搜索公司或岗位…"
              value={q}
              onChange={(e) => {
                setQ(e.target.value);
                setPage(1);
              }}
            />
          </label>
          <a className="secondary" href="/api/export?format=csv">
            <Download size={16} />
            导出
          </a>
        </div>
        <div className="filters">
          <FunnelSimple size={17} />
          {fields.map(([field, label]) => (
            <details className="filter" key={field}>
              <summary>
                {label}
                {filters[field]?.length ? ` · ${filters[field].length}` : ""}
                <span>⌄</span>
              </summary>
              <div className="filter-options">
                {[
                  ...new Set(
                    data.applications.map((a) =>
                      String(a[field as keyof Application] || "未填写"),
                    ),
                  ),
                ]
                  .sort()
                  .map((v) => (
                    <label key={v}>
                      <input
                        type="checkbox"
                        checked={(filters[field] || []).includes(v)}
                        onChange={() => toggle(field, v)}
                      />
                      {v}
                    </label>
                  ))}
              </div>
            </details>
          ))}
          <button
            className="text-button"
            onClick={() => {
              setFilters({});
              setQ("");
              setPage(1);
            }}
          >
            清空筛选
          </button>
        </div>
        {Object.entries(filters).some(([, v]) => v.length > 0) && (
          <div className="filter-tags">
            {Object.entries(filters).flatMap(([field, values]) =>
              values.map((v) => (
                <button key={field + v} onClick={() => toggle(field, v)}>
                  {fields.find((f) => f[0] === field)?.[1]}：{v}
                  <X size={12} />
                </button>
              )),
            )}
          </div>
        )}
        <div className="result-line">
          <span>
            共 <strong>{rows.length}</strong> 份投递
          </span>
          <select
            aria-label="排序方式"
            value={sort}
            onChange={(e) => setSort(e.target.value)}
          >
            <option value="updated">最近更新</option>
            <option value="company">按公司名称</option>
          </select>
        </div>
        {rows.length ? (
          <>
            <div className="application-table">
              <div className="table-header">
                <span>公司 / 岗位</span>
                <span>城市</span>
                <span>投递日期</span>
                <span>当前进度</span>
                <span>招聘批次</span>
                <span />
              </div>
              {rows.slice((page - 1) * 10, page * 10).map((a, i) => (
                <button
                  className="table-row"
                  key={a.id}
                  onClick={() => setEdit(a)}
                >
                  <span className="company-cell">
                    <span className={"company-monogram shade-" + (i % 3)}>
                      {a.company.slice(0, 1)}
                    </span>
                    <span>
                      <strong>{a.company}</strong>
                      <small>{a.role}</small>
                    </span>
                  </span>
                  <span className="city-cell">{a.city || "未填写"}</span>
                  <span className="date-cell">{dateLabel(a.appliedAt)}</span>
                  <span>
                    <b
                      className={
                        "status-badge " + (a.stage === "面试" ? "accent" : "")
                      }
                    >
                      {a.outcome || a.stage}
                    </b>
                    <small className="stage-detail">{a.stageStatus}</small>
                  </span>
                  <span className="batch-cell">{a.batch}</span>
                  <ArrowUpRight size={18} />
                </button>
              ))}
            </div>
            <div className="pagination">
              <button
                className="secondary"
                disabled={page === 1}
                onClick={() => setPage((p) => p - 1)}
              >
                上一页
              </button>
              <span>
                {page} / {Math.ceil(rows.length / 10)}
              </span>
              <button
                className="secondary"
                disabled={page * 10 >= rows.length}
                onClick={() => setPage((p) => p + 1)}
              >
                下一页
              </button>
            </div>
          </>
        ) : (
          <Empty
            title="没有找到符合条件的投递"
            description="调整筛选条件，或记录一个新机会。"
          />
        )}
      </section>
      {edit && (
        <ApplicationForm
          item={edit === true ? undefined : edit}
          onClose={() => setEdit(undefined)}
        />
      )}
    </>
  );
}
