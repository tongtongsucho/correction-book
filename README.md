# 📚 错题本

竞赛生错题管理工具。错题录入、闪卡复习（SM-2 间隔重复）、Notion 风格数据库、Canvas 知识图谱。

## 🌐 在线访问

| 环境 | 地址 |
| --- | --- |
| 🇨🇳 国内版 | https://correction-book-cz3a.ipfs.4everland.app/ |
| 🌍 国际版 | https://correction-book.tongtongzhang.workers.dev/ |

## 📁 目录结构

```
.
├── index.html
├── app.js
├── styles.css
├── manifest.json
├── service-worker.js
└── utils/
    ├── db.js        # localStorage 数据层
    └── review.js    # SM-2 间隔重复算法
```

## 🚀 跑起来

直接用浏览器打开 `index.html` 即可，无需任何构建工具。

数据存储在浏览器 localStorage，无需后端。

## 🗄️ 数据结构

`mistakes`：

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| title | string | 标题（自动从 content 截前 30 字） |
| content | string | 题干文字 |
| imageUrl | string | 图片 base64 |
| subject | enum | math / physics / chemistry / biology / chinese / english / history / geography / politics / other |
| topic | string | 主题（默认取 tags[0]） |
| tags | string[] | 知识点标签 |
| errorReason | string | 错误原因 |
| difficulty | 1/2/3 | 难度 |
| errorCount | number | 出错次数 |
| note | string | 解题笔记 |
| mastered | boolean | 是否已掌握 |
| interval | number | 当前复习间隔（天） |
| easeFactor | number | SM-2 难度系数 EF |
| repetitions | number | 连续答对次数 |
| nextReview | Date | 下次复习时间 |
| lastReviewed | Date | 上次复习时间 |
| relatedIds | string[] | 关联错题（预留） |
| createdAt | Date | 创建时间 |

`reviews`：

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| mistakeId | string | 关联错题 |
| rating | enum | easy / medium / hard |
| reviewedAt | Date | 评分时间 |

## 🧠 SM-2 算法

在 `utils/review.js`，基于标准 SM-2 改良：

- 😊 easy（q=5）：reps=0 → 4天，reps=1 → 6天，之后 × EF
- 🤔 medium（q=3）：reps=0 → 1天，reps=1 → 4天，之后 × EF
- 😰 hard（q=1）：重置 reps=0，interval=1，EF 降低

EF 范围限制在 [1.3, ∞)，防止间隔收缩过快。

## 📷 OCR

`pages/add` 留了 OCR 入口（`onOcr`），计划接腾讯云 OCR。当前点击只是 toast 占位，核心功能跑通后再接。

## 🎨 设计规范

颜色 / 字体 / 间距全部走 `styles.css` 里的 CSS 变量：

```
--accent  金 #c4944a
--accent2 紫 #6b5ce7
--accent4 青 #2eb8a6
--green   绿 #2eb8a6
```

字体降级链：

- 标题：Noto Serif SC → Songti SC → serif
- 正文：Outfit → -apple-system → PingFang SC
- 代码：JetBrains Mono → Menlo → monospace

## ⚠️ 注意

- 🖼️ 图片以 base64 压缩后存入 localStorage，建议单张不超过 800px
- 💾 localStorage 上限约 5-10 MB，建议定期导出备份（功能待实现）
- 🕸️ Canvas 知识图谱使用原生 2D Context，需浏览器支持 Pointer Events API