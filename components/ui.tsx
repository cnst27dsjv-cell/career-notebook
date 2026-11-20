"use client";
import * as Dialog from "@radix-ui/react-dialog";
import { X, Sparkle, Plus } from "@phosphor-icons/react";
import { useRef, useState } from "react";
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
  busyLabel = "正在保存…",
  onClose,
  disabled = false,
  closeOnSubmitStart = false,
  onError,
  onDelete,
}: {
  children: React.ReactNode;
  onSubmit: (f: FormData) => Promise<void>;
  submit?: string;
  busyLabel?: string;
  onClose?: () => void;
  disabled?: boolean;
  closeOnSubmitStart?: boolean;
  onError?: (message: string) => void;
  onDelete?: () => Promise<boolean>;
}) {
  const [busy, setBusy] = useState(false);
  const pending = useRef(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState("");
  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault();
        if (pending.current || disabled) return;
        pending.current = true;
        const f = new FormData(e.currentTarget);
        setBusy(true);
        setError("");
        try {
          if (closeOnSubmitStart) onClose?.();
          await onSubmit(f);
          if (!closeOnSubmitStart) onClose?.();
        } catch (e) {
          const message = e instanceof Error ? e.message : "保存失败";
          setError(message);
          onError?.(message);
        } finally {
          pending.current = false;
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
        {onDelete && (
          <button
            type="button"
            className="text-button"
            disabled={busy || disabled}
            onClick={async () => {
              if (pending.current || disabled) return;
              pending.current = true;
              setBusy(true);
              setDeleting(true);
              setError("");
              try {
                if (await onDelete()) onClose?.();
              } catch (e) {
                const message = e instanceof Error ? e.message : "删除失败";
                setError(message);
                onError?.(message);
              } finally {
                pending.current = false;
                setBusy(false);
                setDeleting(false);
              }
            }}
          >
            {deleting ? "正在删除…" : "删除投递"}
          </button>
        )}
        {onClose && (
          <button type="button" className="secondary" onClick={onClose}>
            取消
          </button>
        )}
        <button className="primary" disabled={busy || disabled}>
          {busy && !deleting ? busyLabel : submit}
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
