import React, { useEffect, useRef, useState } from "react";
import { translateMessage, useT } from "../i18n";
import { Button } from "../ui/controls";

/**
 * A macOS-style sheet: a small panel over a dimmed window. Escape cancels,
 * Enter confirms, and focus starts inside it.
 */
function Sheet({ title, children, actions, onCancel, onSubmit }) {
    useEffect(() => {
        const onKey = (e) => {
            if (e.key === "Escape") onCancel();
        };
        window.addEventListener("keydown", onKey);
        return () => window.removeEventListener("keydown", onKey);
    }, [onCancel]);
    return (
        <div className="sheet-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onCancel()}>
            <form
                className="sheet"
                role="dialog"
                aria-modal="true"
                aria-label={title}
                onSubmit={(e) => {
                    e.preventDefault();
                    onSubmit();
                }}
            >
                <h2 className="sheet__title">{title}</h2>
                {children}
                <div className="sheet__actions">{actions}</div>
            </form>
        </div>
    );
}

/** Ask for a name and save the current EQ and effects under it. */
export function SavePresetSheet({ initial, existing, onSave, onCancel }) {
    const t = useT();
    const [name, setName] = useState(initial);
    const [error, setError] = useState(null);
    const [busy, setBusy] = useState(false);
    const input = useRef(null);
    useEffect(() => {
        input.current?.focus();
        input.current?.select();
    }, []);
    const trimmed = name.trim();
    const replaces = existing.includes(trimmed);
    const submit = () => {
        if (!trimmed || busy) return;
        setBusy(true);
        onSave(trimmed).catch((e) => {
            setError(String(e));
            setBusy(false);
        });
    };
    return (
        <Sheet
            title={t("sheet.saveTitle")}
            onCancel={onCancel}
            onSubmit={submit}
            actions={
                <>
                    <Button onClick={onCancel}>{t("sheet.cancel")}</Button>
                    <button type="submit" className="button button--primary" disabled={!trimmed || busy}>
                        {replaces ? t("sheet.replace") : t("sheet.save")}
                    </button>
                </>
            }
        >
            <p className="sheet__text">{t("sheet.saveText")}</p>
            <input
                ref={input}
                className="field"
                value={name}
                maxLength={40}
                placeholder={t("sheet.placeholder")}
                aria-label={t("sheet.name")}
                onChange={(e) => {
                    setName(e.target.value);
                    setError(null);
                }}
            />
            {replaces && !error && <p className="sheet__hint">{t("sheet.replaces", { name: trimmed })}</p>}
            {error && <p className="sheet__error">{translateMessage(t, error)}</p>}
        </Sheet>
    );
}

export function ConfirmSheet({ title, text, confirm, onConfirm, onCancel }) {
    const t = useT();
    const [busy, setBusy] = useState(false);
    const go = () => {
        if (busy) return;
        setBusy(true);
        onConfirm().catch(() => setBusy(false));
    };
    return (
        <Sheet
            title={title}
            onCancel={onCancel}
            onSubmit={go}
            actions={
                <>
                    <Button onClick={onCancel}>{t("sheet.cancel")}</Button>
                    <button type="submit" className="button button--danger" disabled={busy} autoFocus>
                        {confirm}
                    </button>
                </>
            }
        >
            <p className="sheet__text">{text}</p>
        </Sheet>
    );
}
