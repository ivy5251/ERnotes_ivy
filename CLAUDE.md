# CLAUDE.md

給 Claude Code 的專案脈絡。開工前讀完這份，以及 `README.md`（語法與 build 細節）。

## 這是什麼

急診醫學筆記：一位急診專科醫師（Ivy）自用的臨床速查資料庫。
內容寫在 `content/**.md`，`node build.js` 打包成單一 `docs/index.html`，
透過 GitHub Pages 從 `/docs` 資料夾公開發佈。

**核心使用場景**：病人主訴出現 → 手機在床邊查 → 30 秒內看到該問什麼、該檢查什麼、
該開什麼、能不能回家。這不是讀書筆記，不是教學材料。

**這個場景決定了所有取捨**：

- 手機優先。所有版面決定以窄螢幕、單手、夜間值班為前提。
- 內容深度是**關鍵字級的臨床提示**，一行一則。不寫病生理、不寫機轉、不寫研究背景。
- 速度與可靠性 > 功能豐富。頁面在 JavaScript 壞掉時仍須可讀。

## 使用者與協作方式

Ivy 是內容的唯一作者與臨床權威。你負責結構、格式、工具、程式。

- **一次只做一步。** 每個步驟先討論、取得確認，再執行。這是明確且重要的偏好。
- **不要一次產生大量內容。** 即使她說「幫我把 X 建好」，先提出結構與範圍讓她確認。
- 她會自己填臨床內容。**你不要發明、補充或推斷任何臨床事實** ——
  劑量、適應症、閾值、診斷準則一律不自行填寫。
- 你可以自由重組格式、修版面、改 build 腳本、統一既有內容的呈現方式。
  但**改動任何臨床文字的語意**（含刪除、合併、改寫細節）之前要先問。
- 缺內容的地方用 `!!! 待填` 佔位，不要用看起來合理的東西填滿。

## 這是一個公開網站

站台透過 GitHub Pages 公開發佈，任何人都能看到，也會被搜尋引擎索引。

- **`content/` 裡永遠不能出現病人資料、可識別資訊、或任何不打算公開的內容。**
  看到疑似個案描述、病歷號、日期加姓名這類東西，主動提出來問，不要默默留著。
- 產物 `docs/` 也是公開的，不要在裡面放任何憑證或內部連結。

## 內容格式規則（不可協商）

- Section 標題用**英文**（`History`、`Physical Examination`、`Disposition`）。
  例外：`💊 Medications`、`📋 衛教重點` 沿用現況。
- 內文中英混雜（中文敘述 + 英文專有名詞），這是刻意的，不要統一成單一語言。
- **並列項目一律用縮排子清單**，不要寫成一行逗號串接。
- **藥物一行一種**：藥名 + 劑量 + 途徑 + 頻次。
- **檢查一定寫解剖部位**：`non-contrast brain CT`，不是 `CT`。
- Differential Diagnosis 依風險分三層：`致命性` / `常見良性` / `其他`，
  用 `### {fatal}` / `### {benign}` / `###`。
- **Red Flags 永不收起**，且永遠是頁面第一個 section（`## 🚩 Red Flags {flags}`）。
- Medications 與 衛教重點永遠收起（section 不加 `{open}`），永遠在頁面底部。

## 架構決定（改之前先讀理由）

這些不是隨手選的，各有代價已經評估過。要推翻請先說明理由並取得確認。

1. **零依賴。** build.js 不裝任何 npm 套件。理由：凌晨三點不能有 `npm install` 壞掉。
   不要為了方便引入 marked、markdown-it 或任何 parser。
2. **Toggle 用原生 `<details>`。** JS 壞掉時所有臨床內容仍可讀，只有搜尋失效。
   不要改成 JS 控制的展開狀態。
3. **搜尋用子字串 `indexOf` 掃全表，不用 Lunr / MiniSearch / Fuse。**
   那些函式庫按空白分詞，中文會整句變成一個 token，「暈」搜不到「頭暈」。
   現行做法對中英混雜、劑量字串（`q6h`、`β-hCG`）全部有效，資料量級下是毫秒。
4. **圖表是手寫 SVG，顏色全走 CSS 變數。** 不載 mermaid.js（約 1MB），
   深色模式自動切換，不需要在圖裡硬寫顏色。新圖沿用 `.box` / `.dec` / `.edge` /
   `.head` / `.lbl` / `.yes`。流程圖一律縱向（對應原本 Mermaid 的 `flowchart TD`），
   複雜決策樹拆成多張小圖、各放在一個 toggle 裡，不要做成一張寬圖。
5. **單一輸出檔、圖片 base64 內嵌。** 離線可用比檔案大小重要（急診網路不穩）。
   到約 3 MB 再考慮拆成 shell + 每頁一個 JSON，提早拆會白做工。
6. **輸出到 `docs/`，不是 `dist/`。** GitHub Pages 只能從 repo 根目錄或 `/docs` 發佈。
   不要為了「乾淨」改回 `dist/`，那會直接讓部署失效。
7. **`stub` 是 frontmatter 明寫的，不是猜的。** 之前用「內容量少就判定 stub」的
   啟發式，加一個 section 就誤判，已經移除。

## 工作流程

```bash
node build.js        # 每次改完內容或程式都要跑
open docs/index.html
```

- **build 的警告要清乾淨。** 缺 slug、`related` 指向不存在的頁、重複 slug、
  找不到圖檔、toggle 沒關 —— 這些都是會靜靜壞掉的東西。
- `docs/index.html` 是產物，**永遠不要手改**。改 `template.html` 或 `content/`。
  它會一起進版控，因為 GitHub Pages 直接從 `/docs` 發佈，這樣不需要 CI。
- 新頁面從 `content/_template.md` 複製，不要從零手寫 frontmatter。
- 加了新頁面不需要改任何程式，搜尋會自動涵蓋。

## 目前狀態

- `content/主訴/頭暈.md` — 唯一有完整內容的頁面，是所有主訴頁的格式基準。
- `content/疾病/*.md`、`content/技巧/POCUS-Cardiac.md` — stub，只有 frontmatter。
  存在的目的是讓關聯連結與跨頁搜尋現在就能運作。
- 內容來源是 Ivy 的 Notion 工作區（急診醫學筆記）。目前是單向手動搬移。
  未來可能改成從 Notion API 自動生成，但**還沒決定，不要主動去建那個管線**。

## 已知待辦（不要自己開始做，等她指定）

- `疾病` 頁的 section template 還沒定義 —— 這是下一個結構決策，需要她先決定。
- 頭暈頁還缺兩張流程圖：HINTS 判讀、Dix-Hallpike/BPPV 處置。
- Differential Diagnosis 有一張原本在 Notion 的圖沒搬過來（S3 連結已過期），
  位置用 `!!!` 標著。
- PWA / service worker 離線化還沒做（這對急診網路不穩最有價值）。
- 目前是手動 build + commit + push。之後若要改成 GitHub Actions 自動部署，
  要把 `docs/` 加進 `.gitignore` 並改用 `upload-pages-artifact`。
- `aliases` 需要補口語說法（例如「走不穩」目前搜不到任何東西）。
