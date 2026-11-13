// Gera site/index.html (pt-BR), site/en/index.html e site/sitemap.xml a partir
// de pagina.html + textos.mjs. Sem dependências: `node site/src/build.mjs`.
// O HTML gerado é estático e completo (bom para SEO); o app.js só dá vida.

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { en, pt, SITE, VERSAO } from "./textos.mjs";

const aqui = dirname(fileURLToPath(import.meta.url));
const site = join(aqui, "..");
const modelo = readFileSync(join(aqui, "pagina.html"), "utf8");

const escapar = (t) =>
  String(t).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
// *palavra* vira <em>palavra</em> (depois de escapar).
const enfase = (t) => escapar(t).replace(/\*([^*]+)\*/g, "<em>$1</em>");
const semEnfase = (t) => String(t).replace(/\*/g, "");

function jsonld(t) {
  const url = SITE + t.caminho;
  return JSON.stringify(
    [
      {
        "@context": "https://schema.org",
        "@type": "SoftwareApplication",
        name: "CJC Tune",
        url,
        description: t.description,
        applicationCategory: "MultimediaApplication",
        applicationSubCategory: "Audio equalizer",
        operatingSystem: "Linux",
        softwareVersion: VERSAO,
        license: "https://opensource.org/licenses/MIT",
        isAccessibleForFree: true,
        offers: { "@type": "Offer", price: "0", priceCurrency: "BRL" },
        downloadUrl: "https://github.com/Davicjc/cjc-tune/releases/latest",
        installUrl: url + "#instalar",
        codeRepository: "https://github.com/Davicjc/cjc-tune",
        screenshot: `${SITE}/img/eq-${t.lang === "en" ? "en" : "pt"}.webp`,
        image: `${SITE}/img/icone-512.png`,
        inLanguage: ["pt-BR", "en", "es", "zh-CN"],
        featureList: [t.rec_1_h, t.rec_2_h, t.rec_3_h, t.rec_4_h, t.rec_5_h, t.rec_6_h],
        author: { "@type": "Person", name: "Davi Castro", alternateName: "davicjc", url: "https://davicjc.com" },
      },
      {
        "@context": "https://schema.org",
        "@type": "FAQPage",
        mainEntity: t.faq.map(([q, a]) => ({
          "@type": "Question",
          name: q,
          acceptedAnswer: { "@type": "Answer", text: a },
        })),
      },
      {
        "@context": "https://schema.org",
        "@type": "WebSite",
        name: "CJC Tune",
        url: SITE + "/",
        inLanguage: t.lang,
        publisher: { "@type": "Person", name: "Davi Castro", url: "https://davicjc.com" },
      },
    ],
  ).replace(/</g, "\\u003c");
}

function gerar(t) {
  const curto = t.lang === "en" ? "en" : "pt";
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
    jsonld: jsonld(t),
  };
  // Campos de texto puro (atributos, <title>, meta) não levam <em>.
  const puros = new Set(["title", "description", "keywords", "hero_alt", "hero_versao_modelo"]);
  return modelo.replace(/\{\{(\w+)\}\}/g, (_, k) => {
    if (!(k in vars)) throw new Error(`chave sem texto: ${k}`);
    const v = vars[k];
    if (k === "faq_html" || k === "jsonld") return v;
    return puros.has(k) ? escapar(semEnfase(v)) : enfase(v);
  });
}

writeFileSync(join(site, "index.html"), gerar(pt));
mkdirSync(join(site, "en"), { recursive: true });
writeFileSync(join(site, "en", "index.html"), gerar(en));

const hoje = new Date().toISOString().slice(0, 10);
writeFileSync(
  join(site, "sitemap.xml"),
  `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">
${["/", "/en/"]
  .map(
    (p) => `  <url>
    <loc>${SITE}${p}</loc>
    <lastmod>${hoje}</lastmod>
    <xhtml:link rel="alternate" hreflang="pt-BR" href="${SITE}/"/>
    <xhtml:link rel="alternate" hreflang="en" href="${SITE}/en/"/>
  </url>`,
  )
  .join("\n")}
</urlset>
`,
);
console.log("site gerado: index.html, en/index.html, sitemap.xml");
