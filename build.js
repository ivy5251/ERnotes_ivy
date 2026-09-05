#!/usr/bin/env node
/*
 * 急診醫學筆記 — build
 *
 *   content/**.md  +  template.html  +  assets/  ->  dist/index.html
 *
 * Zero dependencies on purpose: no npm install, nothing to break at 3am.
 * Run with:  node build.js
 */
'use strict';
const fs = require('fs');
const path = require('path');

const ROOT     = __dirname;
const CONTENT  = path.join(ROOT, 'content');
const ASSETS   = path.join(ROOT, 'assets');
const TEMPLATE = path.join(ROOT, 'template.html');
// 手寫的獨立 HTML 頁（不經 markdown pipeline），原樣複製到 docs/
const STATIC   = path.join(ROOT, 'pages');
// GitHub Pages 只能從 repo 根目錄或 /docs 發佈，不能指定其他資料夾。
// 所以產物直接輸出到 docs/，設定一次就不用再管。
const OUT_DIR  = path.join(ROOT, 'docs');
const OUT_FILE = path.join(OUT_DIR, 'index.html');

const warnings = [];
function warn(file, msg){ warnings.push(`${file}: ${msg}`); }

/* ------------------------------------------------------------------ utils */

function esc(s){
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// Inline formatting.  Order matters: code -> bold -> highlight -> link.
function inline(s){
  let h = esc(s);
  h = h.replace(/`([^`]+)`/g, '<code>$1</code>');
  h = h.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  h = h.replace(/==([^=]+)==/g, '<span class="hl">$1</span>');
  h = h.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>');
  return h;
}

// Strip markup so the search index holds clean, matchable text.
function plain(s){
  return s.replace(/`|\*\*|==/g, '')
          .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
          .replace(/\s+/g, ' ')
          .trim();
}

function indentOf(line){ return line.match(/^ */)[0].length; }

// { open nav="Physical Exam" fatal }  ->  { flags:[...], nav:'Physical Exam' }
function parseAttrs(str){
  const a = { flags:[] };
  if (!str) return a;
  const re = /([a-zA-Z_-]+)(?:=(?:"([^"]*)"|([^\s]+)))?/g;
  let m;
  while ((m = re.exec(str))){
    if (m[2] !== undefined || m[3] !== undefined) a[m[1]] = m[2] !== undefined ? m[2] : m[3];
    else a.flags.push(m[1]);
  }
  return a;
}

function splitAttrs(line){
  const m = line.match(/\s*\{([^}]*)\}\s*$/);
  if (!m) return { text: line.trim(), attrs: parseAttrs('') };
  return { text: line.slice(0, m.index).trim(), attrs: parseAttrs(m[1]) };
}

/* ---------------------------------------------------------- frontmatter */

function parseFrontmatter(src, file){
  if (!src.startsWith('---')) { warn(file, '缺少 frontmatter'); return { meta:{}, body:src }; }
  const end = src.indexOf('\n---', 3);
  if (end === -1) { warn(file, 'frontmatter 沒有結束的 ---'); return { meta:{}, body:src }; }
  const head = src.slice(4, end);
  const body = src.slice(src.indexOf('\n', end + 1) + 1);
  const meta = {};
  head.split('\n').forEach(line => {
    if (!line.trim() || line.trim().startsWith('#')) return;
    const i = line.indexOf(':');
    if (i === -1) { warn(file, `frontmatter 這行看不懂：${line.trim()}`); return; }
    const k = line.slice(0, i).trim();
    let v = line.slice(i + 1).trim();
    if (v.startsWith('[') && v.endsWith(']')){
      v = v.slice(1, -1).split(',').map(x => x.trim().replace(/^["']|["']$/g, '')).filter(Boolean);
    } else {
      v = v.replace(/^["']|["']$/g, '');
    }
    meta[k] = v;
  });
  return { meta, body };
}

/* --------------------------------------------------------- block parser */

/*
 * Supported block syntax
 *   ## Heading {open|flags nav="Short"}   section
 *   ### Heading {fatal|benign}            risk tier
 *   > text                                muted note line
 *   - item / 1. item                      lists, nested by 2-space indent
 *   +++ Summary {open} ... +++            collapsible toggle
 *   @svg: name                            inline assets/svg/name.svg
 *   @img: name.png                        inline assets/img/name.png
 *   !!! text                              dashed placeholder box
 */

function makeCtx(slug, file){
  return {
    slug, file, n: 0,
    section: '', sectionIsFlag: false,
    index: [],
    id(){ return `${this.slug}-${++this.n}`; },
    record(text, id){
      const t = plain(text);
      if (!t) return;
      this.index.push({ p: this.slug, s: this.section, f: this.sectionIsFlag ? 1 : 0, id, t });
    }
  };
}

function parseBlocks(L, i, ind, ctx){
  let out = '';

  while (i < L.length){
    const raw = L[i];
    if (!raw.trim()) { i++; continue; }
    const cur = indentOf(raw);
    if (cur < ind) break;
    const t = raw.trim();

    /* ---- toggle ---- */
    if (t.startsWith('+++')){
      if (t === '+++') { i++; continue; }                  // stray close, skip
      const { text: head, attrs } = splitAttrs(t.replace(/^\+\+\+\s*/, ''));
      const inner = [];
      let j = i + 1, depth = 1;
      while (j < L.length){
        const tt = L[j].trim();
        if (tt === '+++'){ depth--; if (depth === 0) break; }
        else if (tt.startsWith('+++')) depth++;
        inner.push(L[j]); j++;
      }
      if (j >= L.length) warn(ctx.file, `toggle「${head}」沒有結束的 +++`);
      const live = inner.filter(x => x.trim());
      const innerInd = live.length ? Math.min(...live.map(indentOf)) : 0;
      const body = live.length ? parseBlocks(inner, 0, innerInd, ctx).html : '';
      const id = ctx.id();
      ctx.record(head, id);
      out += `<details class="t"${attrs.flags.includes('open') ? ' open' : ''}>`
           + `<summary id="${id}"><span class="chev">▶</span>${inline(head)}</summary>`
           + body + `</details>`;
      i = j + 1;
      continue;
    }

    /* ---- risk tier ---- */
    if (/^###\s+/.test(t)){
      const { text: head, attrs } = splitAttrs(t.replace(/^###\s+/, ''));
      const inner = [];
      let j = i + 1;
      while (j < L.length && !/^###\s+/.test(L[j].trim()) && !/^##\s+/.test(L[j].trim())){
        inner.push(L[j]); j++;
      }
      const live = inner.filter(x => x.trim());
      const innerInd = live.length ? Math.min(...live.map(indentOf)) : 0;
      const body = live.length ? parseBlocks(inner, 0, innerInd, ctx).html : '';
      const cls = attrs.flags.find(f => f === 'fatal' || f === 'benign');
      const id = ctx.id();
      ctx.record(head, id);
      out += `<div class="tier${cls ? ' ' + cls : ''}"><h3 id="${id}">${inline(head)}</h3>${body}</div>`;
      i = j;
      continue;
    }

    /* ---- note ---- */
    if (t.startsWith('> ')){
      const id = ctx.id();
      ctx.record(t.slice(2), id);
      out += `<p class="note" id="${id}">${inline(t.slice(2))}</p>`;
      i++;
      continue;
    }

    /* ---- placeholder ---- */
    if (t.startsWith('!!! ')){
      out += `<p class="placeholder">${inline(t.slice(4))}</p>`;
      i++;
      continue;
    }

    /* ---- inline asset ---- */
    let m = t.match(/^@(svg|img):\s*(.+)$/);
    if (m){
      if (m[1] === 'svg'){
        const p = path.join(ASSETS, 'svg', m[2].endsWith('.svg') ? m[2] : m[2] + '.svg');
        if (fs.existsSync(p)) out += `<figure>${fs.readFileSync(p, 'utf8').trim()}</figure>`;
        else { warn(ctx.file, `找不到 SVG：${p}`); out += `<p class="placeholder">缺少圖檔：${esc(m[2])}</p>`; }
      } else {
        const p = path.join(ASSETS, 'img', m[2]);
        if (fs.existsSync(p)){
          const ext = path.extname(m[2]).slice(1).toLowerCase();
          const mime = ext === 'svg' ? 'image/svg+xml' : ext === 'jpg' ? 'image/jpeg' : 'image/' + ext;
          out += `<figure><img alt="" src="data:${mime};base64,${fs.readFileSync(p).toString('base64')}"></figure>`;
        } else { warn(ctx.file, `找不到圖檔：${p}`); out += `<p class="placeholder">缺少圖檔：${esc(m[2])}</p>`; }
      }
      i++;
      continue;
    }

    /* ---- list ---- */
    m = t.match(/^([-*]|\d+\.)\s+(.*)$/);
    if (m){
      const ordered = /^\d+\./.test(t);
      let items = '';
      while (i < L.length){
        const r = L[i];
        if (!r.trim()) { i++; continue; }
        if (indentOf(r) !== cur) break;
        const mm = r.trim().match(/^([-*]|\d+\.)\s+(.*)$/);
        if (!mm) break;
        if (/^\d+\./.test(r.trim()) !== ordered) break;
        const own = mm[2];
        i++;
        const child = [];
        while (i < L.length && (!L[i].trim() || indentOf(L[i]) > cur)) { child.push(L[i]); i++; }
        const live = child.filter(x => x.trim());
        const childInd = live.length ? Math.min(...live.map(indentOf)) : 0;
        const childHtml = live.length ? parseBlocks(child, 0, childInd, ctx).html : '';
        const id = ctx.id();
        ctx.record(own, id);
        items += `<li id="${id}">${inline(own)}${childHtml}</li>`;
      }
      out += ordered ? `<ol>${items}</ol>` : `<ul>${items}</ul>`;
      continue;
    }

    /* ---- bare paragraph ---- */
    const id = ctx.id();
    ctx.record(t, id);
    out += `<p id="${id}">${inline(t)}</p>`;
    i++;
  }

  return { html: out, i };
}

/* -------------------------------------------------------- page assembly */

function renderPage(file, src){
  const { meta, body } = parseFrontmatter(src, file);
  const rel = path.relative(CONTENT, file);

  if (!meta.title) { warn(rel, '缺少 title，跳過這個檔案'); return null; }
  if (!meta.slug)  { warn(rel, '缺少 slug，跳過這個檔案');  return null; }

  const ctx = makeCtx(meta.slug, rel);
  const lines = body.replace(/\t/g, '  ').split('\n');

  // cut the body into ## sections
  const cuts = [];
  lines.forEach((l, k) => { if (/^##\s+/.test(l)) cuts.push(k); });
  // href 頁的內容在獨立 HTML 裡，本來就不該有 section
  if (!cuts.length && !meta.href) warn(rel, '沒有任何 ## section');

  let html = '';
  cuts.forEach((start, k) => {
    const stop = k + 1 < cuts.length ? cuts[k + 1] : lines.length;
    const { text: head, attrs } = splitAttrs(lines[start].replace(/^##\s+/, ''));
    const nav = attrs.nav || head.replace(/^[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]\s*/u, '').trim();

    ctx.section = nav;
    ctx.sectionIsFlag = attrs.flags.includes('flags');

    const secId = ctx.id();
    ctx.record(head, secId);                 // so「Disposition」itself is searchable
    const inner = parseBlocks(lines.slice(start + 1, stop), 0, 0, ctx).html;
    const attr = ` id="${secId}" data-nav="${esc(nav)}"`;

    if (ctx.sectionIsFlag){
      html += `<div class="flags"${attr}><h2>${inline(head)}</h2>${inner}</div>`;
    } else {
      html += `<details class="sec"${attrs.flags.includes('open') ? ' open' : ''}${attr}>`
            + `<summary><span class="chev">▶</span><h2>${inline(head)}</h2></summary>`
            + `<div class="body">${inner}</div></details>`;
    }
  });

  const stub = String(meta.stub) === 'true';

  return {
    meta: {
      slug: meta.slug,
      title: meta.title,
      icon: meta.icon || '',
      type: meta.type || '其他',
      category: meta.category || '',
      aliases: meta.aliases || [],
      related: meta.related || [],
      href: meta.href || '',   // 有 href = 獨立 HTML 頁，不是 markdown 內容
      stub
    },
    refLabel: meta.ref_label || '',
    refUrl: meta.ref_url || '',
    html,
    index: ctx.index
  };
}

function relatedBlock(page, byslug){
  const rel = (page.meta.related || []).map(s => byslug[s]).filter(Boolean);
  let h = '';
  if (rel.length){
    h += `<div class="rel"><h2>相關頁面</h2>`;
    ['疾病', '技巧', '主訴', '藥物'].forEach(t => {
      const g = rel.filter(p => p.meta.type === t);
      if (!g.length) return;
      h += `<p class="rel-label">相關${t}</p><div class="chips">`;
      g.forEach(p => {
        h += `<a href="#/${p.meta.slug}">${p.meta.icon ? p.meta.icon + ' ' : ''}${esc(p.meta.title)}</a>`;
      });
      h += `</div>`;
    });
    h += `</div>`;
  }
  if (page.refLabel || page.refUrl){
    h += `<footer>參考資料：${esc(page.refLabel)}`;
    if (page.refUrl) h += ` · <a href="${esc(page.refUrl)}" target="_blank" rel="noopener">原文</a>`;
    h += `</footer>`;
  }
  return h;
}

/* -------------------------------------------------------------- collect */

function walk(dir, acc){
  fs.readdirSync(dir, { withFileTypes: true }).forEach(d => {
    const p = path.join(dir, d.name);
    if (d.isDirectory()) walk(p, acc);
    else if (d.name.endsWith('.md') && !d.name.startsWith('_')) acc.push(p);
  });
  return acc;
}

/* ---------------------------------------------------------------- build */

function build(){
  if (!fs.existsSync(CONTENT)) { console.error('找不到 content/'); process.exit(1); }

  const files = walk(CONTENT, []).sort();
  const pages = [];
  files.forEach(f => {
    const p = renderPage(f, fs.readFileSync(f, 'utf8'));
    if (p) pages.push(p);
  });

  const byslug = {};
  pages.forEach(p => { byslug[p.meta.slug] = p; });

  // dangling relation check — silent broken links are the worst kind
  pages.forEach(p => {
    (p.meta.related || []).forEach(s => {
      if (!byslug[s]) warn(p.meta.slug, `related 指向不存在的 slug：${s}`);
    });
  });

  const seen = {};
  pages.forEach(p => {
    if (seen[p.meta.slug]) warn(p.meta.slug, '重複的 slug');
    seen[p.meta.slug] = 1;
  });

  const articles = pages.filter(p => !p.meta.href).map(p =>
    `<article class="page" data-slug="${p.meta.slug}" hidden>${p.html}${relatedBlock(p, byslug)}</article>`
  ).join('\n');

  const index = [];
  pages.forEach(p => index.push(...p.index));

  const data = {
    pages: pages.map(p => p.meta),
    index
  };

  let out = fs.readFileSync(TEMPLATE, 'utf8');
  out = out.replace('<!--PAGES-->', articles);
  out = out.replace('<!--DATA-->',
    '<script>window.__DATA__=' + JSON.stringify(data).replace(/</g, '\\u003c') + ';</script>');

  fs.mkdirSync(OUT_DIR, { recursive: true });
  fs.writeFileSync(OUT_FILE, out);

  // 讓 GitHub Pages 跳過 Jekyll。沒有這個檔，開頭是 _ 的檔案會被靜靜忽略。
  fs.writeFileSync(path.join(OUT_DIR, '.nojekyll'), '');

  // 獨立 HTML 頁原樣複製過去
  const copied = [];
  if (fs.existsSync(STATIC)){
    fs.readdirSync(STATIC).filter(f => f.endsWith('.html')).forEach(f => {
      fs.copyFileSync(path.join(STATIC, f), path.join(OUT_DIR, f));
      copied.push(f);
    });
  }
  // href 指向不存在的檔案，跟 related 斷鏈一樣是會靜靜壞掉的東西
  pages.filter(p => p.meta.href).forEach(p => {
    if (!fs.existsSync(path.join(OUT_DIR, p.meta.href))) {
      warn(p.meta.slug, `href 指向不存在的檔案：${p.meta.href}`);
    }
  });

  const kb = (Buffer.byteLength(out) / 1024).toFixed(0);
  console.log(`\n  ${pages.length} 頁 · ${index.length} 個可搜尋單元 · docs/index.html ${kb} KB`);
  pages.forEach(p => {
    console.log(`    ${p.meta.stub ? '○' : '●'} ${p.meta.type}  ${p.meta.title}  ${p.meta.href ? '→ ' + p.meta.href : '(' + p.index.length + ')'}`);
  });
  copied.forEach(f => console.log(`    ⧉ 獨立頁  docs/${f}`));
  if (warnings.length){
    console.log(`\n  ⚠ ${warnings.length} 個警告`);
    warnings.forEach(w => console.log('    ' + w));
  }
  console.log('');
}

build();
