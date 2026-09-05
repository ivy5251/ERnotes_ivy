# 急診醫學筆記

床邊 30 秒查詢用的靜態筆記。內容寫在 `content/` 的 Markdown 檔，`node build.js`
打包成單一 `docs/index.html`（含全站搜尋索引），透過 GitHub Pages 發佈。

```
build.js            打包腳本（零依賴）
template.html       外殼：CSS、路由、搜尋
content/
  _template.md      新頁面用的空白骨架（開頭是 _，build 會略過）
  主訴/頭暈.md
  疾病/BPPV.md
  技巧/POCUS-Cardiac.md
assets/
  svg/titrate.svg   流程圖
  img/              圖檔（會 base64 內嵌，保持離線可用）
docs/index.html     產物，不要手改（GitHub Pages 從這個資料夾發佈）
```

## 用法

```bash
node build.js            # 產生 docs/index.html
open docs/index.html     # 直接開，不需要 server
```

發佈：`node build.js` → commit `docs/` → push，約一分鐘後上線。

build 會印出頁數、可搜尋單元數、檔案大小，以及所有警告（缺 slug、關聯指向不存在的頁、
重複 slug、找不到圖檔、toggle 沒關）。**警告要清乾淨**，那些都是會靜靜壞掉的東西。

新增一頁：複製 `content/_template.md` 到對的資料夾，填 frontmatter，重新 build。
搜尋自動涵蓋新頁面，不用改任何程式。

## Frontmatter

```yaml
title: 頭暈 Dizziness / Vertigo    # 必填
slug: dizziness                    # 必填，網址用，ASCII
icon: 💫
type: 主訴                          # 主訴 / 疾病 / 技巧，決定首頁分組與搜尋排序
category: 神經
aliases: [眩暈, vertigo, 天旋地轉]    # 搜尋別名，急診場景很重要
related: [bppv, pc-stroke]         # 其他頁面的 slug，雙向連結由 build 產生
stub: true                          # 標記還沒填完，首頁會淡化顯示
ref_label: GRACE-3（SAEM 2023）
ref_url: https://...
```

## 內容語法

| 寫法 | 產出 |
|---|---|
| `## Heading {flags}` | Red Flags 區塊，永不收起，紅色左邊條 |
| `## Heading {open}` | 預設展開的 section |
| `## Heading` | 預設收起的 section |
| `## Heading {nav="短名"}` | 頂部 pill 用短名（預設自動去掉 emoji） |
| `### Heading {fatal}` | 風險層級，紅色左條 |
| `### Heading {benign}` | 風險層級，綠色左條 |
| `### Heading` | 風險層級，灰色左條 |
| `- item` / `1. item` | 清單，**縮排 2 空格**代表下一層 |
| `> text` | 灰色說明行 |
| `**粗體**` | 粗體 |
| `==重點==` | 螢光底線（對應 Notion 的 highlight） |
| `` `code` `` | 等寬字 |
| `[文字](網址)` | 外部連結 |
| `+++ 標題 {open}` … `+++` | 可收起的 toggle，可放在清單項目裡（縮排對齊） |
| `@svg: titrate` | 內嵌 `assets/svg/titrate.svg` |
| `@img: ecg.png` | 內嵌 `assets/img/ecg.png`（base64） |
| `!!! text` | 虛線待辦框 |

## 設計決定（改之前先看這裡）

- **Toggle 用原生 `<details>`**。JavaScript 壞掉時，所有臨床內容仍然讀得到，只有搜尋失效。
  不要改成 JS 控制的展開。
- **Red Flags 永不收起**，且永遠是頁面第一個 section。
- **圖表是手寫 SVG，顏色全走 CSS 變數**，深色模式自動切換。不載 mermaid.js（約 1MB），
  也不需要在圖裡硬寫顏色。畫新圖時沿用 `.box` / `.dec` / `.edge` / `.head` / `.lbl` / `.yes` 這些 class。
- **搜尋用子字串比對，不用 Lunr/MiniSearch**。那些函式庫按空白分詞，中文會整句變成一個 token，
  「暈」搜不到「頭暈」。土法煉鋼的 `indexOf` 掃全表在幾萬筆下是幾毫秒，而且中英混雜、
  劑量字串（`q6h`、`β-hCG`）全都能搜。
- **單一輸出檔**。到約 3 MB 再考慮拆成 shell + 每頁一個 JSON，提早拆會白做工。
- **輸出到 `docs/` 而不是 `dist/`**，因為 GitHub Pages 只能從根目錄或 `/docs` 發佈。
  產物一起進版控，換來不需要設 CI。之後若改用 GitHub Actions，再把 `docs/` 加進 `.gitignore`。
- **build 會產生 `docs/.nojekyll`**，讓 GitHub Pages 跳過 Jekyll。沒有它，開頭是 `_` 的檔案會被靜靜忽略。
- **圖片 base64 內嵌**，因為離線可用比檔案大小重要。

## 已知限制

- 搜尋不容錯字：`vestibula` 找得到 `vestibular`（前綴命中），但中間漏字找不到。
- 沒有語意搜尋。「病人走不穩要想什麼」搜不到 —— 用 `aliases` 補常用的口語說法。
- 部署後要重新 build 才會更新，不是即時的。

## 部署（GitHub Pages）

一次性設定：repo → Settings → Pages → Source 選「Deploy from a branch」→ `main` → `/docs`。

網址：`https://<帳號>.github.io/<repo>/`

站台是公開的（免費方案的 GitHub Pages 只能用在公開 repo，且網站本身一律對全網公開）。
不要把任何病人資料、可識別資訊或不打算公開的東西放進 `content/`。
