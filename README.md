# Hyper Tetris — 3D / 4D / 5D / 6D

**[▶ Play Now](https://hyper-tetris.saitotakuya0719.workers.dev)**

3D / 4D / 5D / 6D次元に拡張された実験的テトリスゲーム。Three.js で描画し、次元を上げるほど大きなスコア倍率を得られる。AIオートプレイ機能搭載。

## 操作

| キー | 動作 |
|------|------|
| `← →` | X軸移動 |
| `↑ ↓` | Z軸移動 |
| `Space` | ハードドロップ |
| `Shift` | ソフトドロップ |
| `Tab` | ホールド |
| `Q W E` | XY / YZ / ZX 回転 |
| `A S D` | XW / YW / ZW 回転 (4D+) |
| `Z X` | XV / YV 回転 (5D+) |
| `C V` | XU / ZU 回転 (6D) |
| `3 4 5 6` | 次元切替 |
| `[ ]` | wスライス移動 |
| `, .` | vスライス移動 (5D+) |
| `- =` | uスライス移動 (6D) |
| `P` | ポーズ |
| `R` | リスタート |
| `O` | AIオートプレイ |
| `M` | ミュート |
| `H` / `?` | ヘルプ |

## 起動

```bash
npm install
npm run dev   # http://localhost:5173
```

## 技術スタック

- Three.js
- TypeScript
- Vite

## ホスティング

本番は **Cloudflare Workers (static assets)**: https://hyper-tetris.saitotakuya0719.workers.dev

2026-08-11、Vercel 無料枠の超過でアカウントが停止（全プロジェクトが
`402 DEPLOYMENT_DISABLED`）したため移行した。`wrangler.jsonc` の `assets` だけで
配信し、セキュリティヘッダーは `public/_headers`（`vercel.json` の `headers` を
移植）。`npm run deploy` で build + wrangler deploy。vercel.json は残置。
