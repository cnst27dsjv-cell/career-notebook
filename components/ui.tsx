"use client";
import * as Dialog from "@radix-ui/react-dialog";
import { X, Sparkle, Plus } from "@phosphor-icons/react";
import { useState } from "react";
export function Modal({
  title,
  children,
  onClose,
  wide = false,
}: {
  title: string;
  children: React.ReactNode;
  onClose: () => void;
  wide?: boolean;
}) {
  return (
    <Dialog.Root open onOpenChange={(v) => !v && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="modal-overlay" />
        <Dialog.Content
          className={"modal " + (wide ? "wide" : "")}
          aria-describedby={undefined}
        >
          <div className="modal-title">
            <Dialog.Title>{title}</Dialog.Title>
            <Dialog.Close className="icon-button" aria-label="关闭">
              <X size={21} />
            </Dialog.Close>
          </div>
          {children}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
export function Form({
  children,
  onSubmit,
  submit = "保存",
  onClose,
}: {
  children: React.ReactNode;
  onSubmit: (f: FormData) => Promise<void>;
  submit?: string;
  onClose?: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault();
        const f = new FormData(e.currentTarget);
        setBusy(true);
        setError("");
        try {
          await onSubmit(f);
          onClose?.();
        } catch (e) {
          setError(e instanceof Error ? e.message : "保存失败");
        } finally {
          setBusy(false);
        }
      }}
    >
      {children}
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
      <div className="form-footer">
        {onClose && (
          <button type="button" className="secondary" onClick={onClose}>
            取消
          </button>
        )}
        <button className="primary" disabled={busy}>
          {busy ? "正在保存…" : submit}
        </button>
      </div>
    </form>
  );
}
export function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="field">
      <span>{label}</span>
      {children}
    </label>
  );
}
export function Empty({
  title,
  description,
  action,
}: {
  title: string;
  description: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="empty">
      <Sparkle size={28} />
      <h3>{title}</h3>
      <p>{description}</p>
      {action}
    </div>
  );
}
export function SectionHead({
  en,
  title,
  children,
}: {
  en: string;
  title: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="section-head">
      <div>
        <h2 className="script">
          {en}
          <span className="gold-star">✦</span>
        </h2>
        <p>{title}</p>
      </div>
      {children}
    </div>
  );
}
export function AddButton({
  onClick,
  children,
}: {
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button className="primary" onClick={onClick}>
      <Plus size={17} />
      {children}
    </button>
  );
}
