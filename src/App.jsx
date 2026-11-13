import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { call, subscribe } from "./bridge";
import { I18nContext, makeT, translateMessage } from "./i18n";
import { FIRST_PRESET, PRESETS, PRESET_EQ, PRESET_FX, isKnownPreset } from "./lib/presets";
import Sidebar from "./components/Sidebar";
import { EffectsPage, EqualizerPage, OutputPage, SettingsPage } from "./components/Pages";
import { Button, PopUp } from "./ui/controls";

const FLAT_FX = PRESET_FX.Flat;

/** Window-level state the backend owns: settings, routing, window options. */
function useBackend() {
    const [powered, setPowered] = useState(true);
    const [preset, setPreset] = useState(FIRST_PRESET);
    const [eq, setEq] = useState([...PRESET_EQ[FIRST_PRESET]]);
    const [fx, setFx] = useState({ ...PRESET_FX[FIRST_PRESET] });
    const [audio, setAudio] = useState({ state: "starting", message: null, devices: [], output: null, preferred: null });
    const [info, setInfo] = useState(null);
    const [visible, setVisible] = useState(() => document.visibilityState !== "hidden");
    // Bumped by every options change, so a slow `get_ui_info` reply started
    // before a newer change is dropped instead of undoing it.
    const uiSeq = useRef(0);
    // "Restart audio service": shown as restarting until the router has gone
    // down and come back up (or 8 s pass).
    const [restarting, setRestarting] = useState(false);
    const restartRef = useRef({ active: false, sawDown: false, timer: null });

    const adopt = useCallback((s) => {
        setPowered(s.powered);
        setPreset(isKnownPreset(s.preset) ? s.preset : "Custom");
        setEq([...s.eq]);
        setFx({ ...FLAT_FX, ...s.effects });
    }, []);

    useEffect(() => {
        call("get_ui_info").then(setInfo).catch(() => {});
        // Confirms an automatic GPU choice works on this machine.
        call("ui_ready").catch(() => {});
        let cancelled = false;
        call("get_settings")
            .then((saved) => {
                if (cancelled) return;
                if (saved) adopt(saved);
                else {
                    call("apply_preset_state", {
                        eqBands: PRESET_EQ[FIRST_PRESET],
                        effects: PRESET_FX[FIRST_PRESET],
                        preset: FIRST_PRESET,
                    }).catch(console.error);
                }
            })
            .catch(() => {});
        call("get_audio_status")
            .then((s) => !cancelled && s && setAudio(s))
            .catch(() => {});
        const onStatus = (status) => {
            setAudio(status);
            const r = restartRef.current;
            if (!r.active) return;
            if (status.state !== "running") r.sawDown = true;
            else if (r.sawDown) {
                r.active = false;
                clearTimeout(r.timer);
                setRestarting(false);
            }
        };
        const stops = [
            subscribe("audio-status", onStatus),
            subscribe("power-changed", setPowered),
            subscribe("window-visibility", setVisible),
        ];
        const onVis = () => setVisible(document.visibilityState !== "hidden");
        document.addEventListener("visibilitychange", onVis);
        return () => {
            cancelled = true;
            stops.forEach((stop) => stop());
            document.removeEventListener("visibilitychange", onVis);
        };
    }, [adopt]);

    const actions = useMemo(() => ({
        power(next) {
            setPowered(next);
            call("set_power", { enabled: next }).catch(console.error);
        },
        preset(name) {
            if (!PRESET_EQ[name]) return;
            setPreset(name);
            setEq([...PRESET_EQ[name]]);
            setFx({ ...PRESET_FX[name] });
            call("apply_preset_state", { eqBands: PRESET_EQ[name], effects: PRESET_FX[name], preset: name }).catch(console.error);
        },
        band(index, gain) {
            setEq((prev) => prev.map((g, i) => (i === index ? gain : g)));
            setPreset("Custom");
            call("set_eq_band", { band: index, gain }).catch(console.error);
        },
        effect(key, value) {
            setFx((prev) => ({ ...prev, [key]: value }));
            setPreset("Custom");
            call("set_effect", { effect: key, value }).catch(console.error);
        },
        device(sink) {
            setAudio((prev) => ({ ...prev, preferred: sink }));
            call("set_output_device", { sink }).catch(console.error);
        },
        ui(ui) {
            uiSeq.current += 1;
            setInfo((prev) => (prev ? { ...prev, ui } : prev));
            call("set_ui_settings", { ui })
                .then((r) => r && setInfo((prev) => (prev ? { ...prev, language: r.language, next_renderer: r.next_renderer } : prev)))
                .catch(console.error);
        },
    }), []);

    const restart = useCallback(() => {
        const r = restartRef.current;
        clearTimeout(r.timer);
        Object.assign(r, { active: true, sawDown: false });
        r.timer = setTimeout(() => {
            r.active = false;
            setRestarting(false);
        }, 8000);
        setRestarting(true);
        call("restart_audio_service").catch(() => {
            r.active = false;
            setRestarting(false);
        });
    }, []);

    // Sequence numbers for option changes; see `uiSeq` above.
    const nextSeq = useCallback(() => ++uiSeq.current, []);
    const isLatest = useCallback((n) => uiSeq.current === n, []);

    return { powered, preset, eq, fx, audio, info, setInfo, visible, nextSeq, isLatest, adopt, actions, restarting, restart };
}

/**
 * Updates from GitHub releases. `state`: idle | checking | ready | error |
 * installing | failed. Checked once at launch when the option is on, and on
 * demand from Settings.
 */
function useUpdates(enabled) {
    const [state, setState] = useState("idle");
    const [info, setInfo] = useState(null);
    const [pct, setPct] = useState(0);
    const [error, setError] = useState(null);
    const checked = useRef(false);

    const check = useCallback(() => {
        setState("checking");
        call("check_update")
            .then((i) => {
                setInfo(i);
                setState("ready");
            })
            .catch((e) => {
                setError(String(e));
                setState("error");
            });
    }, []);

    // Once per launch, a few seconds in, so it never competes with startup.
    useEffect(() => {
        if (!enabled || checked.current) return undefined;
        checked.current = true;
        const timer = setTimeout(check, 4000);
        return () => clearTimeout(timer);
    }, [enabled, check]);

    useEffect(() => subscribe("update-progress", setPct), []);

    const install = useCallback(() => {
        if (!info?.available) return;
        if (!info.can_install) {
            call("open_release_page", { url: info.url }).catch(() => {});
            return;
        }
        setPct(0);
        setState("installing");
        // On success the app closes and reopens from the new file.
        call("install_update").catch((e) => {
            setError(String(e));
            setState("failed");
        });
    }, [info]);

    return { state, info, pct, error, check, install };
}

/** What the sidebar and the Output page say about the sound right now. */
function describe(t, audio, powered, restarting) {
    if (restarting) return { tone: "starting", label: t("status.restarting") };
    if (audio.state === "error") {
        return { tone: "error", label: t("status.error"), detail: translateMessage(t, audio.message) };
    }
    if (audio.state === "starting") return { tone: "starting", label: t("status.starting") };
    const device = audio.devices.find((d) => d.name === audio.output)?.description;
    return powered
        ? { tone: "running", label: t("status.running"), detail: device }
        : { tone: "idle", label: t("status.bypassed"), detail: device };
}

export default function App() {
    const b = useBackend();
    const { info } = b;
    const updates = useUpdates(info ? info.ui.check_updates !== false : false);
    const [page, setPage] = useState("eq");
    const [notice, setNotice] = useState(null);

    const language = info?.language ?? "pt";
    const t = useMemo(() => makeT(language), [language]);
    const theme = info?.ui.theme ?? "auto";
    const accent = info?.ui.accent ?? "blue";

    // Layout effect: the theme and accent must be on <html> before the
    // children's effects read colors from it (the spectrum canvas does).
    useLayoutEffect(() => {
        const root = document.documentElement;
        root.lang = language === "zh" ? "zh-CN" : language;
        if (theme === "auto") delete root.dataset.theme;
        else root.dataset.theme = theme;
        root.dataset.accent = accent;
    }, [language, theme, accent]);

    const autostart = useCallback((enabled) => {
        b.nextSeq();
        call("set_autostart", { enabled })
            .then((now) => b.setInfo((prev) => (prev ? { ...prev, autostart: now } : prev)))
            .catch((err) => setNotice({ kind: "error", text: String(err) }));
    }, [b]);

    const exportConfig = useCallback(() => {
        call("export_settings")
            .then((saved) => saved && setNotice({ kind: "ok", key: "set.exported" }))
            .catch((err) => setNotice({ kind: "error", text: String(err) }));
    }, []);

    const importConfig = useCallback(() => {
        call("import_settings")
            .then((s) => {
                if (!s) return;
                const seq = b.nextSeq();
                b.adopt(s);
                b.setInfo((prev) => (prev ? { ...prev, ui: s.ui } : prev));
                call("get_ui_info").then((fresh) => b.isLatest(seq) && b.setInfo(fresh)).catch(() => {});
                setNotice({ kind: "ok", key: "set.imported" });
            })
            .catch((err) => setNotice({ kind: "error", text: String(err) }));
    }, [b]);

    const { restarting, restart } = b;
    const status = describe(t, b.audio, b.powered, restarting);
    const presetOptions = [
        ...PRESETS.map((p) => ({ value: p, label: t(`preset.${p}`) })),
        ...(b.preset === "Custom" ? [{ value: "Custom", label: t("preset.Custom") }] : []),
    ];
    const showPresets = page === "eq" || page === "fx";
    const spectrumOn = page === "eq" && b.visible && (info?.ui.visualizer ?? true);

    const titles = {
        eq: [t("eq.title"), t("eq.subtitle")],
        fx: [t("fx.title"), t("fx.subtitle")],
        output: [t("out.title"), t("out.subtitle")],
        settings: [t("set.title"), null],
    };

    return (
        <I18nContext.Provider value={t}>
            <div className="window">
                <Sidebar page={page} onPage={setPage} powered={b.powered} onPower={b.actions.power} status={status} updates={updates} />
                <main className="main">
                    <header className="toolbar" data-tauri-drag-region>
                        <div className="toolbar__titles" data-tauri-drag-region>
                            <h1 data-tauri-drag-region>{titles[page][0]}</h1>
                            {titles[page][1] && <p data-tauri-drag-region>{titles[page][1]}</p>}
                        </div>
                        {showPresets && (
                            <div className="toolbar__tools">
                                {page === "eq" && (
                                    <Button small onClick={() => b.actions.preset("Flat")} disabled={!b.powered}>
                                        {t("eq.reset")}
                                    </Button>
                                )}
                                <PopUp
                                    wide
                                    label={t("preset.label")}
                                    value={b.preset}
                                    options={presetOptions}
                                    onChange={b.actions.preset}
                                    disabled={!b.powered}
                                />
                            </div>
                        )}
                    </header>
                    <div className="content" key={page}>
                        {page === "eq" && (
                            <EqualizerPage eq={b.eq} onBand={b.actions.band} powered={b.powered} spectrum={spectrumOn} accentKey={`${accent}-${theme}`} />
                        )}
                        {page === "fx" && <EffectsPage fx={b.fx} onEffect={b.actions.effect} powered={b.powered} />}
                        {page === "output" && (
                            <OutputPage audio={b.audio} onDevice={b.actions.device} onRestart={restart} restarting={restarting} status={status} />
                        )}
                        {page === "settings" && (
                            <SettingsPage
                                info={info}
                                onUi={b.actions.ui}
                                onAutostart={autostart}
                                onExport={exportConfig}
                                onImport={importConfig}
                                updates={updates}
                                notice={notice}
                            />
                        )}
                    </div>
                </main>
            </div>
        </I18nContext.Provider>
    );
}
