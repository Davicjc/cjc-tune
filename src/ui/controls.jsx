/**
 * The small set of controls the whole window is built from, drawn to read like
 * macOS: grouped lists, switches, pop-up buttons, segmented controls and
 * sliders. Native elements underneath (button, select, input range), so the
 * keyboard and screen readers work without extra code.
 */

import React, { useId } from "react";

export function Switch({ checked, onChange, disabled, label, id }) {
    return (
        <button
            id={id}
            type="button"
            role="switch"
            aria-checked={checked}
            aria-label={label}
            disabled={disabled}
            className={`switch${checked ? " is-on" : ""}`}
            onClick={() => onChange(!checked)}
        >
            <span className="switch__knob" />
        </button>
    );
}

/** A mac pop-up button: shows the value, opens the native list. */
export function PopUp({ value, options, onChange, disabled, label, id, wide }) {
    return (
        <span className={`popup${disabled ? " is-disabled" : ""}${wide ? " popup--wide" : ""}`}>
            <select
                id={id}
                value={value}
                disabled={disabled}
                aria-label={label}
                onChange={(e) => onChange(e.target.value)}
            >
                {options.map((o) =>
                    o.group ? (
                        <optgroup key={o.group} label={o.group}>
                            {o.options.map((x) => (
                                <option key={x.value} value={x.value}>{x.label}</option>
                            ))}
                        </optgroup>
                    ) : (
                        <option key={o.value} value={o.value}>{o.label}</option>
                    ),
                )}
            </select>
            <svg className="popup__chevrons" width="7" height="11" viewBox="0 0 7 11" aria-hidden="true">
                <path d="M1 4l2.5-2.5L6 4M1 7l2.5 2.5L6 7" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
        </span>
    );
}

export function Segmented({ value, options, onChange, label }) {
    return (
        <div className="segmented" role="radiogroup" aria-label={label}>
            {options.map((o) => (
                <button
                    key={o.value}
                    type="button"
                    role="radio"
                    aria-checked={value === o.value}
                    className={`segmented__item${value === o.value ? " is-selected" : ""}`}
                    onClick={() => onChange(o.value)}
                >
                    {o.label}
                </button>
            ))}
        </div>
    );
}

/**
 * Range slider with the filled part in the accent color. `vertical` turns it
 * into an EQ fader (drawn rotated, so arrow keys still work the natural way).
 */
export function Slider({ value, min, max, step = 1, onChange, disabled, label, valueText, vertical, center }) {
    const span = max - min;
    const from = center != null ? (center - min) / span : 0;
    const to = (value - min) / span;
    const lo = Math.min(from, to) * 100;
    const hi = Math.max(from, to) * 100;
    return (
        <input
            type="range"
            className={`slider${vertical ? " slider--vertical" : ""}`}
            min={min}
            max={max}
            step={step}
            value={value}
            disabled={disabled}
            aria-label={label}
            aria-valuetext={valueText}
            style={{ "--lo": `${lo}%`, "--hi": `${hi}%` }}
            onChange={(e) => onChange(Number(e.target.value))}
        />
    );
}

/** Inset rounded group with an optional caption above and footnote below. */
export function Group({ title, footer, children }) {
    const id = useId();
    return (
        <section className="group" aria-labelledby={title ? id : undefined}>
            {title && <h2 id={id} className="group__title">{title}</h2>}
            <div className="group__body">{children}</div>
            {footer && <p className="group__footer">{footer}</p>}
        </section>
    );
}

/** One row of a group: label (and hint) on the left, control on the right. */
export function Row({ label, hint, icon, children, htmlFor, dim, onClick, selected }) {
    const Tag = onClick ? "button" : "div";
    return (
        <Tag
            type={onClick ? "button" : undefined}
            className={`row${dim ? " is-dim" : ""}${onClick ? " row--action" : ""}`}
            onClick={onClick}
            aria-pressed={onClick && selected != null ? selected : undefined}
        >
            {icon && <span className="row__icon" aria-hidden="true">{icon}</span>}
            <span className="row__text">
                {htmlFor ? (
                    <label className="row__label" htmlFor={htmlFor}>{label}</label>
                ) : (
                    <span className="row__label">{label}</span>
                )}
                {hint && <span className="row__hint">{hint}</span>}
            </span>
            {children != null && <span className="row__control">{children}</span>}
        </Tag>
    );
}

export function Button({ children, onClick, disabled, primary, small }) {
    return (
        <button
            type="button"
            className={`button${primary ? " button--primary" : ""}${small ? " button--small" : ""}`}
            onClick={onClick}
            disabled={disabled}
        >
            {children}
        </button>
    );
}

/** Status dot: green running, grey bypassed, orange connecting, red error. */
export function Dot({ tone }) {
    return <span className={`dot dot--${tone}`} aria-hidden="true" />;
}
