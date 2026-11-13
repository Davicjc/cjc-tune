import React, { useEffect, useState } from "react";
import { windowAction } from "../bridge";
import { useT } from "../i18n";
import { Dot, Switch } from "../ui/controls";
import { IconEq, IconGear, IconSparkles, IconSpeaker } from "../ui/icons";

const PAGES = [
    { id: "eq", icon: IconEq },
    { id: "fx", icon: IconSparkles },
    { id: "output", icon: IconSpeaker },
    { id: "settings", icon: IconGear },
];

/** Close / minimize / zoom, grey while the window is not focused, as on a Mac. */
function TrafficLights() {
    const t = useT();
    const [focused, setFocused] = useState(() => document.hasFocus());
    useEffect(() => {
        const on = () => setFocused(true);
        const off = () => setFocused(false);
        window.addEventListener("focus", on);
        window.addEventListener("blur", off);
        return () => {
            window.removeEventListener("focus", on);
            window.removeEventListener("blur", off);
        };
    }, []);
    return (
        <div className={`lights${focused ? "" : " is-blurred"}`}>
            {[
                ["close", "M3.5 3.5l5 5M8.5 3.5l-5 5"],
                ["minimize", "M3 6h6"],
                ["zoom", "M3.6 8.4V4.6a1 1 0 011-1h3.8M8.4 3.6v3.8a1 1 0 01-1 1H3.6"],
            ].map(([action, glyph]) => (
                <button
                    key={action}
                    type="button"
                    className={`lights__btn lights__btn--${action}`}
                    aria-label={t(`win.${action}`)}
                    title={t(`win.${action}`)}
                    onClick={() => windowAction(action)}
                >
                    <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true">
                        <path d={glyph} fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
                    </svg>
                </button>
            ))}
        </div>
    );
}

/** Shown above the power card while a newer release is waiting. */
function UpdateCard({ updates }) {
    const t = useT();
    const { state, info, pct } = updates;
    const busy = state === "installing";
    return (
        <div className="update-card" role="status">
            <span className="update-card__title">{t("upd.available", { version: info.latest })}</span>
            {busy ? (
                <span className="update-card__progress">
                    <span className="bar"><span style={{ width: `${pct}%` }} /></span>
                    {pct >= 100 ? t("upd.restarting") : t("upd.downloading", { pct })}
                </span>
            ) : (
                <button type="button" className="button button--primary button--small" onClick={updates.install}>
                    {info.can_install ? t("upd.install") : t("upd.download")}
                </button>
            )}
            {state === "failed" && <span className="update-card__error">{t("upd.failed", { msg: updates.error })}</span>}
        </div>
    );
}

/**
 * Full-height sidebar: window controls, the four sections, and at the bottom
 * the one control that matters most, processing on/off, with what is going on.
 */
export default function Sidebar({ page, onPage, powered, onPower, status, updates }) {
    const t = useT();
    return (
        <aside className="sidebar">
            <div className="sidebar__top" data-tauri-drag-region>
                <TrafficLights />
            </div>

            <nav className="nav" aria-label={t("nav.label")}>
                {PAGES.map(({ id, icon: Icon }) => (
                    <button
                        key={id}
                        type="button"
                        className={`nav__item${page === id ? " is-active" : ""}`}
                        aria-current={page === id ? "page" : undefined}
                        onClick={() => onPage(id)}
                    >
                        <Icon />
                        <span>{t(`nav.${id}`)}</span>
                    </button>
                ))}
            </nav>

            <div className="sidebar__spacer" data-tauri-drag-region />

            {updates.info?.available && (
                <UpdateCard updates={updates} />
            )}

            <div className="power">
                <div className="power__head">
                    <span className="power__name">CJC Tune</span>
                    <Switch checked={powered} onChange={onPower} label={t("power.label")} />
                </div>
                <div className="power__status" role="status">
                    <Dot tone={status.tone} />
                    <span className="power__line" title={status.detail || status.label}>
                        {status.label}
                    </span>
                </div>
                {status.detail && <div className="power__detail" title={status.detail}>{status.detail}</div>}
            </div>
            <div className="signature" data-tauri-drag-region>by davicjc</div>
        </aside>
    );
}
