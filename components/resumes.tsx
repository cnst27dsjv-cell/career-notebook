"use client";
import { useState } from "react";
import {
  FileText,
  Download,
  Star,
  Archive,
  UploadSimple,
} from "@phosphor-icons/react";
import { useWorkspace, dateLabel } from "./context";
import { AddButton, Modal, Form, Field, Empty } from "./ui";
export default function Resumes() {
  const { data, refresh, mutate, notify } = useWorkspace();
  const [open, setOpen] = useState(false);
  const [archived, setArchived] = useState(false);
  const rows = data.resumes.filter((r) => archived || !r.archived);
  return (
    <>
      <div className="page-heading">
        <div>
          <h1>
            我的简历 <span className="script">A story of you</span>
          </h1>
          <p>用合适的版本，介绍独一无二的你。</p>
        </div>
        <AddButton onClick={() => setOpen(true)}>上传新版本</AddButton>
      </div>
      <div className="notice-paper">
        <FileText size={21} />
        <span>
          每份投递都保留当时使用的版本。更新简历，不会改变过去的记录。
        </span>
      </div>
      <label className="check archive-toggle">
        <input
          type="checkbox"
          checked={archived}
          onChange={(e) => setArchived(e.target.checked)}
        />
        显示已归档版本
      </label>
      <div className="resume-grid">
        {rows.map((r) => {
          const file = data.files.find((f) => f.id === r.fileId);
          return (
            <article className="resume-card paper-panel" key={r.id}>
              <div className="resume-preview">
                <div className="mini-page">
                  <span className="mini-title">{r.series}</span>
                  <span />
                  <i />
                  <i />
                  <b />
                  <i />
                  <i />
                  <b />
                  <i />
                </div>
                <span className="version-seal">v{r.number}</span>
              </div>
              <div className="resume-card-heading">
                <h2>{r.series}</h2>
                {r.current && (
                  <span className="status-badge accent">当前使用</span>
                )}
              </div>
              <p className="muted">
                {r.target || "通用版本"} · {dateLabel(r.createdAt)}
                {data.resumes.find((v) => v.series === r.series)?.id === r.id
                  ? " · 最新上传"
                  : ""}
              </p>
              <p className="resume-note">{r.notes || "还没有版本说明"}</p>
              <small className="file-caption">
                {file?.name} · {Math.round((file?.size || 0) / 1024)} KB
                {r.archived ? " · 已归档" : ""}
              </small>
              <div className="card-actions">
                <a className="secondary" href={"/api/files/" + r.fileId}>
                  <Download size={16} />
                  下载
                </a>
                {file?.name.toLowerCase().endsWith(".pdf") && (
                  <a
                    className="text-button"
                    href={"/api/files/" + r.fileId + "?preview=1"}
                    target="_blank"
                    rel="noreferrer"
                  >
                    预览
                  </a>
                )}
                {!r.current && (
                  <button
                    className="text-button"
                    onClick={() =>
                      mutate({ action: "resume.current", id: r.id }).catch(
                        (e) => notify(e.message),
                      )
                    }
                  >
                    <Star size={15} />
                    设为当前
                  </button>
                )}
                {!r.archived && (
                  <button
                    className="icon-button"
                    aria-label={"归档 " + r.series + " v" + r.number}
                    onClick={() =>
                      mutate({ action: "resume.archive", id: r.id }).catch(
                        (e) => notify(e.message),
                      )
                    }
                  >
                    <Archive size={17} />
                  </button>
                )}
              </div>
            </article>
          );
        })}
      </div>
      {!rows.length && (
        <section className="paper-panel">
          <Empty
            title="从你的第一份简历开始"
            description="上传 PDF 或 Word DOCX，按岗位方向整理不同版本。"
            action={
              <button className="secondary" onClick={() => setOpen(true)}>
                <UploadSimple size={17} />
                选择简历
              </button>
            }
          />
        </section>
      )}
      {open && (
        <Modal title="上传简历新版本" onClose={() => setOpen(false)}>
          <Form
            onClose={() => setOpen(false)}
            submit="保存简历版本"
            onSubmit={async (f) => {
              const r = await fetch("/api/files", { method: "POST", body: f });
              const result = await r.json();
              if (!r.ok) throw Error(result.error);
              await refresh();
              notify("新版本已保存，旧投递记录保持不变。");
            }}
          >
            <Field label="简历系列">
              <input
                required
                name="series"
                list="series"
                placeholder="例如：产品经理简历"
              />
              <datalist id="series">
                {[...new Set(data.resumes.map((r) => r.series))].map((s) => (
                  <option key={s}>{s}</option>
                ))}
              </datalist>
            </Field>
            <Field label="适用岗位 / 公司">
              <input name="target" placeholder="例如：互联网产品岗" />
            </Field>
            <Field label="简历文件（PDF / DOCX，最大 10 MB）">
              <input required type="file" name="file" accept=".pdf,.docx" />
            </Field>
            <Field label="这次更新了什么">
              <textarea
                name="notes"
                rows={3}
                placeholder="例如：补充用户增长项目，突出数据分析能力"
              />
            </Field>
            <label className="check">
              <input name="allowDuplicate" type="checkbox" value="true" />
              允许把相同文件存为新版本
            </label>
          </Form>
        </Modal>
      )}
    </>
  );
}
