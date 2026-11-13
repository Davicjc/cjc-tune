// Gera o site estático: index.html (pt-BR), en/index.html, os guias
// (guias/<slug>/ e en/guides/<slug>/), sitemap.xml. Sem dependências:
// `node site/src/build.mjs`. O HTML sai completo (bom para SEO); o app.js só dá vida.

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { en, pt, SITE, VERSAO } from "./textos.mjs";
import { guiasEn, guiasPt } from "./guias.mjs";

const aqui = dirname(fileURLToPath(import.meta.url));
const site = join(aqui, "..");
const modelo = readFileSync(join(aqui, "pagina.html"), "utf8");
const modeloGuia = readFileSync(join(aqui, "guia.html"), "utf8");
const hoje = new Date().toISOString().slice(0, 10);

const escapar = (t) =>
  String(t).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const enfase = (t) => escapar(t).replace(/\*([^*]+)\*/g, "<em>$1</em>");
const semEnfase = (t) => String(t).replace(/\*/g, "");
const crase = (t) => escapar(t).replace(/`([^`]+)`/g, "<code>$1</code>");
const json = (o) => JSON.stringify(o).replace(/</g, "\\u003c");

const pastaGuia = (lang) => (lang === "en" ? "en/guides" : "guias");
const urlGuia = (lang, slug) => `${SITE}/${pastaGuia(lang)}/${slug}/`;
const guiasDe = (lang) => (lang === "en" ? guiasEn : guiasPt);

function preencher(texto, vars, puros = new Set(), crus = new Set()) {
  return texto.replace(/\{\{(\w+)\}\}/g, (_, k) => {
    if (!(k in vars)) throw new Error(`chave sem texto: ${k}`);
    const v = vars[k];
    if (crus.has(k)) return v;
    return puros.has(k) ? escapar(semEnfase(v)) : enfase(v);
  });
}

// ── Página principal ─────────────────────────────────────
function jsonldHome(t) {
  const url = SITE + t.caminho;
  return json([
    {
      "@context": "https://schema.org",
      "@type": "SoftwareApplication",
      name: "CJC Tune",
      alternateName: t.lang === "en" ? "CJC Tune Linux equalizer" : "CJC Tune equalizador para Linux",
      url,
      description: t.description,
      applicationCategory: "MultimediaApplication",
      applicationSubCategory: "Audio equalizer",
      operatingSystem: "Linux",
      softwareVersion: VERSAO,
      releaseNotes: "https://github.com/Davicjc/cjc-tune/releases",
      license: "https://opensource.org/licenses/MIT",
      isAccessibleForFree: true,
      offers: { "@type": "Offer", price: "0", priceCurrency: "BRL" },
      downloadUrl: "https://github.com/Davicjc/cjc-tune/releases/latest",
      installUrl: url + "#instalar",
      codeRepository: "https://github.com/Davicjc/cjc-tune",
      screenshot: `${SITE}/img/eq-${t.lang === "en" ? "en" : "pt"}.webp`,
      image: `${SITE}/img/icone-512.png`,
      inLanguage: ["pt-BR", "en", "es", "zh-CN"],
      keywords: t.keywords,
      featureList: [t.rec_1_h, t.rec_2_h, t.rec_3_h, t.rec_4_h, t.rec_5_h, t.rec_6_h],
      author: { "@type": "Person", name: "Davi Castro", alternateName: "davicjc", url: "https://davicjc.com" },
    },
    {
      "@context": "https://schema.org",
      "@type": "FAQPage",
      mainEntity: t.faq.map(([q, a]) => ({ "@type": "Question", name: q, acceptedAnswer: { "@type": "Answer", text: a } })),
    },
    {
      "@context": "https://schema.org",
      "@type": "WebSite",
      name: "CJC Tune",
      url: SITE + "/",
      inLanguage: t.lang,
      publisher: { "@type": "Person", name: "Davi Castro", url: "https://davicjc.com" },
    },
  ]);
}

function gerarHome(t) {
  const curto = t.lang === "en" ? "en" : "pt";
  const guias = guiasDe(t.lang);
  const base = t.lang === "en" ? "guides/" : "guias/";
  const vars = {
    ...t,
    site: SITE,
    versao: VERSAO,
    lang_curto: curto,
    outro_lang: curto === "en" ? "pt-BR" : "en",
    hero_versao: t.hero_versao.replace("{{versao}}", VERSAO),
    hero_versao_modelo: t.hero_versao,
    faq_html: t.faq
      .map(([q, a]) => `<details><summary>${escapar(q)}</summary><p>${escapar(a)}</p></details>`)
      .join("\n        "),
    guias_html: guias
      .map((g) => `<li><a href="${base}${g.slug}/"><strong>${escapar(g.h1)}</strong><span>${escapar(g.resumo)}</span></a></li>`)
      .join("\n        "),
    rodape_guias: guias.map((g) => `<a href="${base}${g.slug}/">${escapar(g.h1)}</a>`).join("\n      "),
    jsonld: jsonldHome(t),
  };
  const puros = new Set(["title", "description", "keywords", "hero_alt", "hero_versao_modelo"]);
  const crus = new Set(["faq_html", "guias_html", "rodape_guias", "jsonld"]);
  return preencher(modelo, vars, puros, crus);
}

// ── Guias ────────────────────────────────────────────────
function corpo(blocos) {
  return blocos
    .map(([tipo, v]) => {
      if (tipo === "h2") return `<h2>${escapar(v)}</h2>`;
      if (tipo === "p") return `<p>${crase(v)}</p>`;
      if (tipo === "code") return `<pre><code>${escapar(v)}</code></pre>`;
      const tag = tipo === "ol" ? "ol" : "ul";
      return `<${tag}>${v.map((i) => `<li>${crase(i)}</li>`).join("")}</${tag}>`;
    })
    .join("\n    ");
}

function gerarGuia(t, g, todos) {
  const lang = t.lang;
  const curto = lang === "en" ? "en" : "pt";
  const url = urlGuia(lang, g.slug);
  const home = lang === "en" ? "../../" : "../../";
  const raiz = lang === "en" ? "../../../" : "../../";
  const passos = g.blocos.find(([tipo]) => tipo === "ol");
  const ld = [
    {
      "@context": "https://schema.org",
      "@type": "TechArticle",
      headline: g.titulo,
      description: g.descricao,
      inLanguage: t.lang,
      url,
      mainEntityOfPage: url,
      datePublished: "2026-11-13",
      dateModified: hoje,
      image: `${SITE}/img/og-${curto}.png`,
      author: { "@type": "Person", name: "Davi Castro", url: "https://davicjc.com" },
      publisher: { "@type": "Person", name: "Davi Castro", url: "https://davicjc.com" },
      about: { "@type": "SoftwareApplication", name: "CJC Tune", operatingSystem: "Linux", url: SITE + t.caminho },
    },
    {
      "@context": "https://schema.org",
      "@type": "BreadcrumbList",
      itemListElement: [
        { "@type": "ListItem", position: 1, name: "CJC Tune", item: SITE + t.caminho },
        { "@type": "ListItem", position: 2, name: t.nav_guias, item: SITE + t.caminho + "#guias" },
        { "@type": "ListItem", position: 3, name: g.h1, item: url },
      ],
    },
  ];
  if (passos) {
    ld.push({
      "@context": "https://schema.org",
      "@type": "HowTo",
      name: g.h1,
      description: g.resumo,
      inLanguage: t.lang,
      step: passos[1].map((texto, i) => ({ "@type": "HowToStep", position: i + 1, text: texto.replace(/`/g, "") })),
    });
  }
  const outros = todos.filter((x) => x.slug !== g.slug);
  const vars = {
    ...t,
    site: SITE,
    versao: VERSAO,
    lang_curto: curto,
    url,
    home,
    raiz,
    titulo: g.titulo,
    descricao: g.descricao,
    h1: g.h1,
    resumo: g.resumo,
    alternates: `<link rel="alternate" hreflang="${t.lang}" href="${url}">`,
    corpo: corpo(g.blocos),
    relacionados: outros
      .map((x) => `<li><a href="../${x.slug}/"><strong>${escapar(x.h1)}</strong><span>${escapar(x.resumo)}</span></a></li>`)
      .join(""),
    jsonld: json(ld),
  };
  const puros = new Set(["titulo", "descricao", "foto_alt", "trilha_rotulo"]);
  const crus = new Set(["alternates", "corpo", "relacionados", "jsonld"]);
  return preencher(modeloGuia, vars, puros, crus);
}

// ── Escrever ─────────────────────────────────────────────
const escrever = (caminho, html) => {
  mkdirSync(dirname(join(site, caminho)), { recursive: true });
  writeFileSync(join(site, caminho), html);
};

escrever("index.html", gerarHome(pt));
escrever("en/index.html", gerarHome(en));
for (const g of guiasPt) escrever(`guias/${g.slug}/index.html`, gerarGuia(pt, g, guiasPt));
for (const g of guiasEn) escrever(`en/guides/${g.slug}/index.html`, gerarGuia(en, g, guiasEn));

const alt = `\n    <xhtml:link rel="alternate" hreflang="pt-BR" href="${SITE}/"/>\n    <xhtml:link rel="alternate" hreflang="en" href="${SITE}/en/"/>`;
const urls = [
  { loc: `${SITE}/`, pri: "1.0", alt },
  { loc: `${SITE}/en/`, pri: "0.9", alt },
  ...guiasPt.map((g) => ({ loc: urlGuia("pt", g.slug), pri: "0.8", alt: "" })),
  ...guiasEn.map((g) => ({ loc: urlGuia("en", g.slug), pri: "0.7", alt: "" })),
];
writeFileSync(
  join(site, "sitemap.xml"),
  `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">
${urls.map((u) => `  <url>\n    <loc>${u.loc}</loc>\n    <lastmod>${hoje}</lastmod>\n    <priority>${u.pri}</priority>${u.alt}\n  </url>`).join("\n")}
</urlset>
`,
);
console.log(`site gerado: 2 páginas principais, ${guiasPt.length + guiasEn.length} guias, sitemap com ${urls.length} URLs`);
