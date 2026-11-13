// CJC Tune — página. JavaScript puro, sem dependências.
// 1) A curva do EQ: mesma fórmula do app (peaking, Q 1,4, 48 kHz), montada na
//    entrada e arrastável. 2) "Ouça": batida gerada no navegador passando pelos
//    mesmos 10 filtros (Web Audio). 3) Baralho de telas preso à rolagem.
// 4) Links de download apontando para o arquivo da última release.
(() => {
  "use strict";

  const BANDAS = [32, 64, 125, 250, 500, 1000, 2000, 4000, 8000, 16000];
  const ROTULOS = ["32", "64", "125", "250", "500", "1k", "2k", "4k", "8k", "16k"];
  const TAXA = 48000;
  const Q = 1.4;
  const MAX = 12;
  const calmo = matchMedia("(prefers-reduced-motion: reduce)").matches;

  // ── Matemática do EQ (espelho de src/lib/eqMath.js do app) ──
  const F_MIN = BANDAS[0] / Math.SQRT2;
  const F_MAX = BANDAS[9] * Math.SQRT2;
  const LOG_MIN = Math.log(F_MIN);
  const LOG_SPAN = Math.log(F_MAX) - LOG_MIN;
  const xDe = (f) => (Math.log(f) - LOG_MIN) / LOG_SPAN;
  const yDe = (db) => 0.5 - db / (2 * MAX);
  const dbDe = (y) => Math.round(Math.max(-MAX, Math.min(MAX, (0.5 - y) * 2 * MAX)) * 2) / 2;

  function pico(f, g) {
    const a = 10 ** (g / 40), w = (2 * Math.PI * f) / TAXA, al = Math.sin(w) / (2 * Q), a0 = 1 + al / a;
    return [(1 + al * a) / a0, (-2 * Math.cos(w)) / a0, (1 - al * a) / a0, (-2 * Math.cos(w)) / a0, (1 - al / a) / a0];
  }
  function magDb([b0, b1, b2, a1, a2], f) {
    const w = (2 * Math.PI * f) / TAXA;
    const c1 = Math.cos(w), s1 = Math.sin(w), c2 = Math.cos(2 * w), s2 = Math.sin(2 * w);
    const nr = b0 + b1 * c1 + b2 * c2, ni = -(b1 * s1 + b2 * s2);
    const dr = 1 + a1 * c1 + a2 * c2, di = -(a1 * s1 + a2 * s2);
    return 10 * Math.log10((nr * nr + ni * ni) / (dr * dr + di * di));
  }
  function curva(ganhos, n = 140) {
    const fs = ganhos.map((g, i) => (Math.abs(g) < 0.1 ? null : pico(BANDAS[i], g))).filter(Boolean);
    const pts = [];
    for (let i = 0; i < n; i++) {
      const x = i / (n - 1), f = Math.exp(LOG_MIN + x * LOG_SPAN);
      let db = 0;
      for (const c of fs) db += magDb(c, f);
      pts.push([x, Math.max(-14, Math.min(14, db))]);
    }
    return pts;
  }

  const NS = "http://www.w3.org/2000/svg";
  const el = (nome, attrs = {}, pai) => {
    const e = document.createElementNS(NS, nome);
    for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
    if (pai) pai.appendChild(e);
    return e;
  };

  /** Desenha e controla uma curva de EQ dentro de um <svg viewBox>. */
  class EqVivo {
    constructor(raiz, { onMuda } = {}) {
      this.raiz = raiz;
      this.svg = raiz.querySelector("svg");
      const vb = this.svg.viewBox.baseVal;
      this.L = vb.width;
      this.A = vb.height;
      this.pad = { e: 34, d: 10, c: 12, b: 26 };
      this.ganhos = (raiz.dataset.ganhos || "0,0,0,0,0,0,0,0,0,0").split(",").map(Number);
      this.onMuda = onMuda;
      this.montarEstatico();
      this.desenhar();
      this.ligarArraste();
    }
    px(x) { return this.pad.e + x * (this.L - this.pad.e - this.pad.d); }
    py(y) { return this.pad.c + y * (this.A - this.pad.c - this.pad.b); }
    montarEstatico() {
      const g = el("g", {}, this.svg);
      for (const db of [12, 6, -6, -12]) el("line", { class: "eq-grade", x1: this.px(0), x2: this.px(1), y1: this.py(yDe(db)), y2: this.py(yDe(db)) }, g);
      el("line", { class: "eq-zero", x1: this.px(0), x2: this.px(1), y1: this.py(yDe(0)), y2: this.py(yDe(0)) }, g);
      for (const db of [12, 0, -12]) {
        const t = el("text", { class: "eq-rotulo", x: 2, y: this.py(yDe(db)) + 4 }, g);
        t.textContent = db > 0 ? `+${db}` : `${db}`;
      }
      BANDAS.forEach((f, i) => {
        const x = this.px(xDe(f));
        el("line", { class: "eq-coluna", x1: x, x2: x, y1: this.py(0), y2: this.py(1) }, g);
        const t = el("text", { class: "eq-rotulo", x, y: this.A - 6, "text-anchor": "middle" }, g);
        t.textContent = ROTULOS[i];
      });
      this.espectro = el("path", { class: "eq-espectro", d: "" }, this.svg);
      this.barras = BANDAS.map((_, i) => {
        const b = el("line", { class: "eq-barra" }, this.svg);
        b.style.setProperty("--i", i);
        return b;
      });
      this.area = el("path", { class: "eq-area" }, this.svg);
      this.linha = el("path", { class: "eq-linha" }, this.svg);
      this.pontos = BANDAS.map((_, i) => {
        const p = el("circle", { class: "eq-ponto", r: 7 }, this.svg);
        p.style.setProperty("--i", i);
        return p;
      });
    }
    desenhar() {
      const zero = this.py(yDe(0));
      const pts = curva(this.ganhos).map(([x, db]) => [this.px(x), this.py(yDe(db))]);
      const d = "M" + pts.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(" L");
      this.linha.setAttribute("d", d);
      this.area.setAttribute("d", `${d} L${this.px(1)},${zero} L${this.px(0)},${zero} Z`);
      BANDAS.forEach((f, i) => {
        const x = this.px(xDe(f)), y = this.py(yDe(this.ganhos[i]));
        this.pontos[i].setAttribute("cx", x);
        this.pontos[i].setAttribute("cy", y);
        const b = this.barras[i];
        b.setAttribute("x1", x); b.setAttribute("x2", x);
        b.setAttribute("y1", Math.min(y, zero)); b.setAttribute("y2", Math.max(y, zero) + 0.01);
        b.style.transformOrigin = this.ganhos[i] >= 0 ? "50% 100%" : "50% 0%";
      });
    }
    definir(ganhos) {
      this.ganhos = [...ganhos];
      this.desenhar();
      this.onMuda?.(this.ganhos);
    }
    ligarArraste() {
      let banda = null;
      const ponto = (e) => {
        const r = this.svg.getBoundingClientRect();
        const sx = this.L / r.width, sy = this.A / r.height;
        return [(e.clientX - r.left) * sx, (e.clientY - r.top) * sy];
      };
      const bandaEm = (x) => {
        let melhor = 0, dist = Infinity;
        BANDAS.forEach((f, i) => { const d = Math.abs(this.px(xDe(f)) - x); if (d < dist) { dist = d; melhor = i; } });
        return melhor;
      };
      const aplicar = (y) => {
        const db = dbDe((y - this.pad.c) / (this.A - this.pad.c - this.pad.b));
        if (db === this.ganhos[banda]) return;
        this.ganhos[banda] = db;
        this.desenhar();
        this.onMuda?.(this.ganhos);
      };
      this.svg.addEventListener("pointerdown", (e) => {
        if (e.button !== 0) return;
        const [x, y] = ponto(e);
        banda = bandaEm(x);
        this.svg.setPointerCapture(e.pointerId);
        this.pontos[banda].classList.add("ativo");
        aplicar(y);
        this.raiz.dispatchEvent(new CustomEvent("eq-mexeu"));
      });
      this.svg.addEventListener("pointermove", (e) => banda != null && aplicar(ponto(e)[1]));
      const soltar = () => { if (banda != null) this.pontos[banda].classList.remove("ativo"); banda = null; };
      this.svg.addEventListener("pointerup", soltar);
      this.svg.addEventListener("pointercancel", soltar);
    }
    /** A curva se monta: barras sobem, linha se desenha, pontos encaixam. */
    montar() {
      if (calmo) return;
      this.linha.style.setProperty("--comp", Math.ceil(this.linha.getTotalLength()));
      this.raiz.setAttribute("data-montar", "");
      requestAnimationFrame(() => requestAnimationFrame(() => this.raiz.classList.add("montado")));
      // Depois da montagem, os traços voltam ao normal (arrastar não pode depender da animação).
      setTimeout(() => { this.raiz.removeAttribute("data-montar"); this.raiz.classList.remove("montado"); }, 2400);
    }
  }

  // ── Topo: fio embaixo só depois de rolar ──
  const topo = document.querySelector(".topo");
  const marcarTopo = () => topo?.classList.toggle("rolou", scrollY > 8);
  addEventListener("scroll", marcarTopo, { passive: true });
  marcarTopo();

  // ── Hero ──
  const heroEl = document.querySelector('[data-eq="hero"]');
  const hero = heroEl && new EqVivo(heroEl);
  hero?.montar();

  // ── Ouça: Web Audio com os mesmos 10 filtros ──
  const demoEl = document.querySelector('[data-eq="demo"]');
  let som = null;
  const demo = demoEl && new EqVivo(demoEl, { onMuda: (g) => som?.ganhos(g) });

  function criarSom() {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return null;
    const ctx = new Ctx({ sampleRate: TAXA });
    const entrada = ctx.createGain();
    const filtros = BANDAS.map((f) => {
      const b = ctx.createBiquadFilter();
      b.type = "peaking"; b.frequency.value = f; b.Q.value = Q; b.gain.value = 0;
      return b;
    });
    filtros.reduce((a, b) => (a.connect(b), b), entrada);
    // Limitador simples para o grave forte não estourar, como o do app.
    const limite = ctx.createDynamicsCompressor();
    limite.threshold.value = -6; limite.knee.value = 0; limite.ratio.value = 20; limite.attack.value = 0.003; limite.release.value = 0.1;
    const molhado = ctx.createGain(), seco = ctx.createGain(), mestre = ctx.createGain();
    filtros[9].connect(limite).connect(molhado).connect(mestre);
    entrada.connect(seco).connect(mestre);
    mestre.gain.value = 0.32; seco.gain.value = 0; molhado.gain.value = 1;
    mestre.connect(ctx.destination);

    const ruido = ctx.createBuffer(1, TAXA, TAXA);
    const canal = ruido.getChannelData(0);
    for (let i = 0; i < canal.length; i++) canal[i] = Math.random() * 2 - 1;

    // Batida de 96 BPM: bumbo, baixo, chimbal e um acorde. Notas fixas: é sempre a mesma música.
    const bpm = 96, passo = 60 / bpm / 4;
    const baixo = [45, 0, 45, 0, 45, 0, 48, 0, 41, 0, 41, 0, 43, 0, 43, 0];
    const acordes = [[57, 60, 64], [53, 57, 60], [55, 59, 62], [52, 55, 59]];
    const hz = (m) => 440 * 2 ** ((m - 69) / 12);
    let proximo = 0, n = 0, timer = null;

    const bumbo = (t) => {
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.frequency.setValueAtTime(140, t); o.frequency.exponentialRampToValueAtTime(42, t + 0.18);
      g.gain.setValueAtTime(1, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.42);
      o.connect(g).connect(entrada); o.start(t); o.stop(t + 0.45);
    };
    const nota = (m, t, dur, tipo, vol, corte) => {
      const o = ctx.createOscillator(), g = ctx.createGain(), lp = ctx.createBiquadFilter();
      o.type = tipo; o.frequency.value = hz(m); lp.type = "lowpass"; lp.frequency.value = corte;
      g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(vol, t + 0.01); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
      o.connect(lp).connect(g).connect(entrada); o.start(t); o.stop(t + dur + 0.05);
    };
    const chimbal = (t, vol) => {
      const s = ctx.createBufferSource(), hp = ctx.createBiquadFilter(), g = ctx.createGain();
      s.buffer = ruido; hp.type = "highpass"; hp.frequency.value = 7500;
      g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.06);
      s.connect(hp).connect(g).connect(entrada); s.start(t, Math.random() * 0.5); s.stop(t + 0.08);
    };
    const agendar = () => {
      while (proximo < ctx.currentTime + 0.12) {
        const i = n % 16;
        if (i % 4 === 0) bumbo(proximo);
        if (baixo[i]) nota(baixo[i] - 12, proximo, passo * 1.8, "sawtooth", 0.32, 520);
        if (i % 2 === 1) chimbal(proximo, i % 4 === 3 ? 0.16 : 0.08);
        if (i === 0) acordes[Math.floor(n / 16) % 4].forEach((m) => nota(m, proximo, passo * 15, "triangle", 0.05, 3200));
        if (i === 8) chimbal(proximo, 0.04);
        proximo += passo; n++;
      }
    };
    return {
      tocar() {
        ctx.resume(); proximo = ctx.currentTime + 0.05; agendar();
        timer = setInterval(agendar, 25);
      },
      pausar() { clearInterval(timer); timer = null; ctx.suspend(); },
      tocando: () => timer != null,
      ganhos(g) { g.forEach((v, i) => filtros[i].gain.setTargetAtTime(v, ctx.currentTime, 0.02)); },
      comEq(sim) {
        const t = ctx.currentTime;
        molhado.gain.setTargetAtTime(sim ? 1 : 0, t, 0.03);
        seco.gain.setTargetAtTime(sim ? 0 : 1, t, 0.03);
      },
    };
  }

  const botaoTocar = document.querySelector("[data-tocar]");
  const rotulo = botaoTocar?.querySelector("span");
  let comEq = true;
  const parar = () => {
    if (!som?.tocando()) return;
    som.pausar();
    botaoTocar.setAttribute("aria-pressed", "false");
    rotulo.textContent = botaoTocar.dataset.rotuloTocar;
  };
  botaoTocar?.addEventListener("click", () => {
    if (!som) {
      som = criarSom();
      if (!som) return;
      som.ganhos(demo.ganhos);
      som.comEq(comEq);
    }
    if (som.tocando()) parar();
    else {
      som.tocar();
      botaoTocar.setAttribute("aria-pressed", "true");
      rotulo.textContent = botaoTocar.dataset.rotuloPausar;
    }
  });
  // Som não fica tocando escondido: pausa ao sair da seção ou da aba.
  document.addEventListener("visibilitychange", () => document.hidden && parar());
  const secaoOuca = document.getElementById("ouca");
  if (secaoOuca) new IntersectionObserver(([e]) => !e.isIntersecting && parar(), { threshold: 0 }).observe(secaoOuca);

  document.querySelectorAll("[data-ab]").forEach((b) =>
    b.addEventListener("click", () => {
      comEq = b.dataset.ab === "com";
      document.querySelectorAll("[data-ab]").forEach((x) => x.setAttribute("aria-checked", String(x === b)));
      demoEl.classList.toggle("desligado", !comEq);
      som?.comEq(comEq);
    }),
  );
  const chips = [...document.querySelectorAll("[data-preset]")];
  chips.forEach((c) =>
    c.addEventListener("click", () => {
      chips.forEach((x) => x.setAttribute("aria-checked", String(x === c)));
      demo.definir(c.dataset.preset.split(",").map(Number));
    }),
  );
  demoEl?.addEventListener("eq-mexeu", () => chips.forEach((x) => x.setAttribute("aria-checked", "false")));

  // ── 01: o pulso só corre com a seção na tela (hiberna fora dela) ──
  const fluxo = document.querySelector("[data-fluxo]");
  if (fluxo && !calmo) new IntersectionObserver(([e]) => fluxo.classList.toggle("ativo", e.isIntersecting)).observe(fluxo);

  // ── 04: baralho preso à rolagem, só em tela larga ──
  const palco = document.querySelector("[data-baralho]");
  const cartas = palco ? [...palco.querySelectorAll(".carta")] : [];
  const largo = matchMedia("(min-width: 1061px)");
  let pendente = false;
  function baralho() {
    pendente = false;
    if (!largo.matches || calmo) { cartas.forEach((c) => c.removeAttribute("style")); return; }
    const sec = palco.parentElement, r = sec.getBoundingClientRect();
    const total = sec.offsetHeight - innerHeight;
    const p = Math.min(1, Math.max(0, -r.top / total)) * (cartas.length - 1);
    cartas.forEach((c, i) => {
      const d = i - p; // >0: ainda por vir; <0: já empilhada atrás
      const y = d > 0 ? d * 520 : d * 22;
      const s = d > 0 ? 1 : 1 + d * 0.05;
      const rx = d > 0 ? Math.min(d, 1) * -14 : 0;
      const o = d < -2.2 ? 0 : 1;
      c.style.setProperty("--y", y.toFixed(1));
      c.style.setProperty("--s", s.toFixed(3));
      c.style.setProperty("--rx", rx.toFixed(2));
      c.style.setProperty("--o", o);
      c.style.zIndex = String(10 + i);
    });
  }
  if (cartas.length) {
    const pedir = () => { if (!pendente) { pendente = true; requestAnimationFrame(baralho); } };
    addEventListener("scroll", pedir, { passive: true });
    addEventListener("resize", pedir);
    largo.addEventListener("change", pedir);
    baralho();
  }

  // ── Downloads: aponta para o arquivo certo da última release ──
  fetch("https://api.github.com/repos/Davicjc/cjc-tune/releases/latest", { headers: { Accept: "application/vnd.github+json" } })
    .then((r) => (r.ok ? r.json() : null))
    .then((rel) => {
      if (!rel?.tag_name) return;
      const versao = rel.tag_name.replace(/^v/, "");
      const tam = (b) => `${Math.round(b / 1048576)} MB`;
      for (const a of document.querySelectorAll("[data-asset]")) {
        const tipo = a.dataset.asset;
        const arq = rel.assets.find((x) => x.name.endsWith(tipo === "deb" ? ".deb" : ".AppImage"));
        if (!arq) continue;
        a.href = arq.browser_download_url;
        a.textContent = `${a.textContent.split(" · ")[0]} · ${tam(arq.size)}`;
        const cmd = document.querySelector(`[data-cmd="${tipo === "deb" ? "deb" : "appimage"}"]`);
        if (cmd) cmd.textContent = cmd.textContent.replace(/cjc-tune_[\d.]+_amd64/g, arq.name.replace(/\.(deb|AppImage)$/, ""));
      }
      const v = document.querySelector("[data-versao-texto]");
      if (v) v.textContent = v.dataset.versaoTexto.replace("{{versao}}", versao);
    })
    .catch(() => {});

  // ── Copiar comandos ──
  document.querySelectorAll("[data-copiar]").forEach((b) =>
    b.addEventListener("click", () => {
      const txt = document.querySelector(`[data-cmd="${b.dataset.copiar}"]`)?.textContent ?? "";
      navigator.clipboard?.writeText(txt).then(() => {
        const antes = b.textContent;
        b.textContent = b.dataset.ok;
        setTimeout(() => (b.textContent = antes), 1600);
      });
    }),
  );
})();
