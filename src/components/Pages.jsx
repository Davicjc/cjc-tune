import React from "react";
import { LANGUAGES, translateMessage, useT } from "../i18n";
import { APP_VERSION, BAND_FREQS, BAND_LABELS, EFFECTS } from "../lib/presets";
import { Button, Dot, Group, PopUp, Row, Segmented, Slider, Switch } from "../ui/controls";
import { IconAmbience, IconBass, IconCheck, IconDynamic, IconFidelity, IconRestart, IconSurround } from "../ui/icons";
import EqGraph from "./EqGraph";

const EFFECT_ICONS = {
    fidelity: IconFidelity,
    ambiance: IconAmbience,
    dynamic: IconDynamic,
    surround: IconSurround,
    bass: IconBass,
};

const fmtDb = (v) => (v > 0 ? `+${v}` : `${v}`);

export function EqualizerPage({ eq, onBand, powered, spectrum, accentKey }) {
    const t = useT();
    return (
        <div className={`card eq${powered ? "" : " is-off"}`} title={powered ? undefined : t("power.offHint")}>
            <EqGraph gains={eq} onBand={onBand} disabled={!powered} spectrum={spectrum} powered={powered} accentKey={accentKey} />
            <div className="faders">
                {BAND_FREQS.map((freq, i) => (
                    <div key={freq} className="fader">
                        <span className={`fader__value${eq[i] !== 0 ? " is-set" : ""}`}>{fmtDb(eq[i])}</span>
                        <div className="fader__track">
                            <Slider
                                vertical
                                min={-12}
                                max={12}
                                step={0.5}
                                center={0}
                                value={eq[i]}
                                disabled={!powered}
                                label={t("eq.band", { freq })}
                                valueText={t("eq.value", { value: fmtDb(eq[i]) })}
                                onChange={(v) => onBand(i, v)}
                            />
                        </div>
                        <span className="fader__freq">{BAND_LABELS[i]}</span>
                    </div>
                ))}
            </div>
        </div>
    );
}

export function EffectsPage({ fx, onEffect, powered }) {
    const t = useT();
    return (
        <Group>
            {EFFECTS.map((key) => {
                const Icon = EFFECT_ICONS[key];
                return (
                    <Row key={key} icon={<Icon />} label={t(`fx.${key}`)} hint={t(`fx.${key}.hint`)} dim={!powered}>
                        <span className="fx-control">
                            <Slider
                                min={0}
                                max={100}
                                value={fx[key]}
                                disabled={!powered}
                                label={t(`fx.${key}`)}
                                valueText={`${fx[key]}%`}
                                onChange={(v) => onEffect(key, v)}
                            />
                            <span className="fx-control__value">{fx[key]}</span>
                        </span>
                    </Row>
                );
            })}
        </Group>
    );
}

export function OutputPage({ audio, onDevice, onRestart, restarting, status }) {
    const t = useT();
    const auto = !audio.preferred;
    return (
        <>
            <Group title={t("out.devices")} footer={t("out.rate")}>
                <Row label={t("out.auto")} hint={t("out.autoHint")} onClick={() => onDevice(null)} selected={auto}>
                    {auto && <span className="check"><IconCheck /></span>}
                </Row>
                {audio.devices.length === 0 && (
                    <Row label={audio.state === "starting" ? t("out.detecting") : t("out.none")} dim />
                )}
                {audio.devices.map((d) => {
                    const chosen = audio.preferred === d.name;
                    const inUse = audio.output === d.name;
                    return (
                        <Row key={d.name} label={d.description} onClick={() => onDevice(d.name)} selected={chosen}>
                            {inUse && <span className="tag">{t("out.inUse")}</span>}
                            {chosen && <span className="check"><IconCheck /></span>}
                        </Row>
                    );
                })}
            </Group>

            <Group title={t("out.service")} footer={t("out.restartHint")}>
                <Row label={t("out.state")}>
                    <span className="state">
                        <Dot tone={status.tone} />
                        {status.label}
                    </span>
                </Row>
                <Row label={t("out.restart")}>
                    <Button onClick={onRestart} disabled={restarting}>
                        <IconRestart />
                        {restarting ? t("status.restarting") : t("out.restartButton")}
                    </Button>
                </Row>
            </Group>
        </>
    );
}

const ACCENTS = ["blue", "purple", "pink", "red", "orange", "yellow", "green", "graphite"];
const RENDER_MODES = ["auto", "gpu", "software"];

export function SettingsPage({ info, onUi, onAutostart, onExport, onImport, notice }) {
    const t = useT();
    if (!info) return <p className="muted">{t("set.loading")}</p>;
    const { ui, graphics, tray_available: tray, autostart, system_language: sysLang } = info;
    const set = (key) => (value) => onUi({ ...ui, [key]: value });
    const restartNeeded = info.next_renderer != null && info.next_renderer !== graphics.renderer;
    const sysName = LANGUAGES.find((l) => l.code === sysLang)?.name ?? "English";
    const noticeText = notice ? (notice.key ? t(notice.key) : translateMessage(t, notice.text)) : "";

    return (
        <>
            <Group title={t("set.general")} footer={tray ? undefined : t("set.trayMissing")}>
                <Row label={t("set.autostart")} htmlFor="s-autostart">
                    <Switch id="s-autostart" checked={autostart} onChange={onAutostart} />
                </Row>
                <Row label={t("set.hidden")} htmlFor="s-hidden" dim={!tray || !autostart}>
                    <Switch id="s-hidden" checked={tray && ui.start_hidden} disabled={!tray || !autostart} onChange={set("start_hidden")} />
                </Row>
                <Row label={t("set.tray")} htmlFor="s-tray" dim={!tray}>
                    <Switch id="s-tray" checked={tray && ui.close_to_tray} disabled={!tray} onChange={set("close_to_tray")} />
                </Row>
            </Group>

            <Group title={t("set.appearance")}>
                <Row label={t("set.theme")}>
                    <Segmented
                        label={t("set.theme")}
                        value={ui.theme}
                        onChange={set("theme")}
                        options={["auto", "light", "dark"].map((v) => ({ value: v, label: t(`theme.${v}`) }))}
                    />
                </Row>
                <Row label={t("set.accent")} hint={t(`accent.${ui.accent}`)}>
                    <span className="swatches" role="radiogroup" aria-label={t("set.accent")}>
                        {ACCENTS.map((a) => (
                            <button
                                key={a}
                                type="button"
                                role="radio"
                                aria-checked={ui.accent === a}
                                aria-label={t(`accent.${a}`)}
                                title={t(`accent.${a}`)}
                                className={`swatch swatch--${a}${ui.accent === a ? " is-selected" : ""}`}
                                onClick={() => set("accent")(a)}
                            />
                        ))}
                    </span>
                </Row>
                <Row label={t("set.visualizer")} hint={t("set.visualizerHint")} htmlFor="s-spectrum">
                    <Switch id="s-spectrum" checked={ui.visualizer} onChange={set("visualizer")} />
                </Row>
                <Row label={t("set.language")} htmlFor="s-lang">
                    <PopUp
                        id="s-lang"
                        value={ui.language}
                        onChange={set("language")}
                        options={[
                            { value: "auto", label: t("set.languageAuto", { name: sysName }) },
                            ...LANGUAGES.map((l) => ({ value: l.code, label: l.name })),
                        ]}
                    />
                </Row>
            </Group>

            <Group title={t("set.performance")}>
                <Row
                    label={t("set.rendering")}
                    htmlFor="s-render"
                    hint={
                        t("set.renderingNow", {
                            renderer: t(`renderer.${graphics.renderer}`),
                            reason: t(`reason.${graphics.reason}`),
                        }) + (restartNeeded ? t("set.restartToApply") : "")
                    }
                >
                    <PopUp
                        id="s-render"
                        value={ui.render_mode}
                        onChange={set("render_mode")}
                        options={RENDER_MODES.map((m) => ({ value: m, label: t(`mode.${m}`) }))}
                    />
                </Row>
            </Group>

            <Group title={t("set.config")} footer={noticeText || undefined}>
                <Row label={t("set.configHint")}>
                    <span className="buttons">
                        <Button onClick={onExport}>{t("set.export")}</Button>
                        <Button onClick={onImport}>{t("set.import")}</Button>
                    </span>
                </Row>
            </Group>

            <Group title={t("set.about")}>
                <div className="about">
                    <img className="about__icon" src="/icon.png" alt="" width="56" height="56" />
                    <div>
                        <div className="about__name">CJC Tune</div>
                        <div className="about__line">{t("set.version", { version: APP_VERSION })} · {t("set.by")}</div>
                        <div className="about__line muted">{t("set.basedOn")}</div>
                    </div>
                </div>
            </Group>
        </>
    );
}
