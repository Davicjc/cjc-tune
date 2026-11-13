import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { call } from "../bridge";
import { useT } from "../i18n";
import { BAND_FREQS } from "../lib/presets";
import { SPECTRUM_FREQS, dbToY, freqToX, responseCurve, smoothPath, yToDb } from "../lib/eqMath";

const HEIGHT = 216;
const POLL_MS = 50; // the processor updates its spectrum at 20 Hz
const FRAME_MS = 1000 / 30; // easing between updates; 30 fps looks the same as 60

/** Width of an element, kept current. */
function useWidth(ref) {
    const [width, setWidth] = useState(600);
    useEffect(() => {
        const el = ref.current;
        if (!el) return undefined;
        const ro = new ResizeObserver(([entry]) => setWidth(Math.max(200, entry.contentRect.width)));
        ro.observe(el);
        return () => ro.disconnect();
    }, [ref]);
    return width;
}

/**
 * Live spectrum drawn on a canvas behind the curve. Polls the processor only
 * while `active` (spectrum on, window visible, this page open); otherwise it
 * does no work at all. Outside Tauri there is no data, so nothing is drawn:
 * the window never shows invented audio.
 */
function useSpectrum(canvasRef, width, active, powered, accentKey) {
    useEffect(() => {
        const canvas = canvasRef.current;
        const ctx = canvas?.getContext("2d");
        if (!ctx) return undefined;
        const dpr = window.devicePixelRatio || 1;
        canvas.width = Math.round(width * dpr);
        canvas.height = Math.round(HEIGHT * dpr);
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        ctx.clearRect(0, 0, width, HEIGHT);
        if (!active || !powered) return undefined;

        const accent = getComputedStyle(document.documentElement).getPropertyValue("--accent").trim() || "#0a84ff";
        const xs = SPECTRUM_FREQS.map((f) => Math.min(1, Math.max(0, freqToX(f))) * width);
        const target = new Float32Array(32);
        const shown = new Float32Array(32);
        let cancelled = false;
        let poll = null;
        let raf = null;
        let last = performance.now();
        let lastDraw = 0;

        const fetchOnce = () => {
            if (cancelled) return;
            call("get_visualizer_data")
                .then((data) => {
                    if (cancelled || !data?.length) return;
                    for (let i = 0; i < 32; i++) target[i] = data[i] ?? 0;
                })
                .catch(() => {})
                .finally(() => {
                    if (!cancelled) poll = setTimeout(fetchOnce, POLL_MS);
                });
        };

        const draw = (now) => {
            if (cancelled) return;
            raf = requestAnimationFrame(draw);
            if (now - lastDraw < FRAME_MS) return;
            lastDraw = now;
            const dt = Math.min((now - last) / 1000, 0.1);
            last = now;
            let moving = false;
            for (let i = 0; i < 32; i++) {
                const diff = target[i] - shown[i];
                if (Math.abs(diff) > 0.05) {
                    shown[i] += diff * Math.min((diff > 0 ? 16 : 5) * dt, 1);
                    moving = true;
                }
            }
            if (!moving) return;
            ctx.clearRect(0, 0, width, HEIGHT);
            const y = (v) => HEIGHT - (Math.min(v, 100) / 100) * HEIGHT * 0.92;
            ctx.beginPath();
            // The first FFT bin already covers everything below ~140 Hz, so
            // it carries on to the left edge instead of leaving the bass empty.
            ctx.moveTo(0, HEIGHT);
            ctx.lineTo(0, y(shown[0]));
            ctx.lineTo(xs[0], y(shown[0]));
            for (let i = 1; i < 32; i++) {
                const mx = (xs[i - 1] + xs[i]) / 2;
                ctx.quadraticCurveTo(xs[i - 1], y(shown[i - 1]), mx, (y(shown[i - 1]) + y(shown[i])) / 2);
            }
            ctx.lineTo(width, y(shown[31]));
            ctx.lineTo(width, HEIGHT);
            ctx.closePath();
            ctx.globalAlpha = 0.16;
            ctx.fillStyle = accent;
            ctx.fill();
            ctx.globalAlpha = 1;
        };

        call("get_visualizer_data")
            .then(() => {
                fetchOnce();
                raf = requestAnimationFrame(draw);
            })
            .catch(() => {});

        return () => {
            cancelled = true;
            clearTimeout(poll);
            cancelAnimationFrame(raf);
        };
    }, [canvasRef, width, active, powered, accentKey]);
}

/**
 * The EQ as a picture: the real response of the ten filters, a draggable
 * point per band, and the live spectrum underneath.
 */
export default function EqGraph({ gains, onBand, disabled, spectrum, powered, accentKey }) {
    const t = useT();
    const boxRef = useRef(null);
    const canvasRef = useRef(null);
    const width = useWidth(boxRef);
    const [dragging, setDragging] = useState(null);
    useSpectrum(canvasRef, width, spectrum, powered, accentKey);

    const curve = useMemo(() => {
        const pts = responseCurve(gains).map(([x, db]) => [x * width, dbToY(Math.max(-14, Math.min(14, db))) * HEIGHT]);
        const line = smoothPath(pts);
        const zero = dbToY(0) * HEIGHT;
        const fill = `${line} L${width},${zero} L0,${zero} Z`;
        return { line, fill };
    }, [gains, width]);

    const bandAt = useCallback((clientX) => {
        const rect = boxRef.current.getBoundingClientRect();
        const x = (clientX - rect.left) / rect.width;
        return Math.max(0, Math.min(BAND_FREQS.length - 1, Math.floor(x * BAND_FREQS.length)));
    }, []);

    const dbAt = useCallback((clientY) => {
        const rect = boxRef.current.getBoundingClientRect();
        return yToDb((clientY - rect.top) / rect.height);
    }, []);

    const onPointerDown = (e) => {
        if (disabled || e.button !== 0) return;
        const band = bandAt(e.clientX);
        e.currentTarget.setPointerCapture(e.pointerId);
        setDragging(band);
        const db = dbAt(e.clientY);
        if (db !== gains[band]) onBand(band, db);
    };
    const onPointerMove = (e) => {
        if (dragging == null) return;
        const db = dbAt(e.clientY);
        if (db !== gains[dragging]) onBand(dragging, db);
    };
    const stop = () => setDragging(null);

    return (
        <div
            ref={boxRef}
            className={`graph${disabled ? " is-disabled" : ""}${dragging != null ? " is-dragging" : ""}`}
            style={{ height: HEIGHT }}
            role="img"
            aria-label={t("eq.graph")}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={stop}
            onPointerCancel={stop}
        >
            <canvas ref={canvasRef} className="graph__spectrum" style={{ width, height: HEIGHT }} />
            <svg className="graph__svg" width={width} height={HEIGHT} aria-hidden="true">
                {[12, 6, -6, -12].map((db) => (
                    <line key={db} className="graph__grid" x1="0" x2={width} y1={dbToY(db) * HEIGHT} y2={dbToY(db) * HEIGHT} />
                ))}
                <line className="graph__zero" x1="0" x2={width} y1={dbToY(0) * HEIGHT} y2={dbToY(0) * HEIGHT} />
                {BAND_FREQS.map((f) => (
                    <line key={f} className="graph__col" x1={freqToX(f) * width} x2={freqToX(f) * width} y1="0" y2={HEIGHT} />
                ))}
                {[12, 6, 0, -6, -12].map((db) => (
                    <text key={db} className="graph__db" x="6" y={dbToY(db) * HEIGHT + (db === 12 ? 11 : db === -12 ? -4 : 4)}>
                        {db > 0 ? `+${db}` : db}
                    </text>
                ))}
                <path className="graph__fill" d={curve.fill} />
                <path className="graph__line" d={curve.line} />
                {BAND_FREQS.map((f, i) => (
                    <circle
                        key={f}
                        className={`graph__knob${dragging === i ? " is-active" : ""}`}
                        cx={freqToX(f) * width}
                        cy={dbToY(gains[i]) * HEIGHT}
                        r={dragging === i ? 7.5 : 6}
                    />
                ))}
            </svg>
        </div>
    );
}
