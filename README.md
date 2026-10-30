# 将棋盤（対面）

Android タブレットを机に平置きして使う、人対人の将棋盤アプリ（PWA）。
2 人は画面の短い辺の両側に向かい合って座る。奥側の人の表示はすべて 180° 回っている。
駒には漢字に加えて、動ける方向の矢印を描いている。インストール後は完全オフラインで動く。

## ファイル

| パス | 内容 |
|---|---|
| `index.html` / `css/style.css` | 画面 |
| `js/rules.js` | ルールエンジン（合法手・指す・終局判定。DOM 非依存） |
| `js/sfen.js` / `js/handicap.js` | SFEN の読み書き、平手・駒落ちの初期配置 |
| `js/piece-svg.js` / `js/render.js` / `js/ui.js` | 駒の絵、盤の描画、操作とダイアログ |
| `js/main.js` | 起動、保存・復元、画面を消さない処理、Service Worker の登録 |
| `sw.js` | Service Worker（`CACHE_VERSION` を持つ） |
| `manifest.webmanifest` / `icons/` | PWA の設定とアイコン |
| `tests/` | テスト・確認用スクリプト（公開には不要だが置いたままでよい） |

## 公開（初回）

1. GitHub に新しいリポジトリを作り、このフォルダの中身をリポジトリ直下に置いて push する
   （`node_modules/` と `tests/screenshots/` は `.gitignore` で除外している）
2. リポジトリの Settings → Pages → Source を「Deploy from a branch」、Branch を `main` / `/(root)` にして保存
3. 数分後に `https://<ユーザー名>.github.io/<リポジトリ名>/` で開ける

パスはすべて相対パスで書いてあるので、リポジトリ名のサブパスでもそのまま動く。

## タブレットに入れる

1. Android タブレットの Chrome で上の URL を開く
2. Chrome のメニューから「アプリをインストール」（または「ホーム画面に追加」）
3. ホーム画面のアイコンから起動する。全画面・縦向きで開く
4. 機内モードにして起動し直し、動くことを確認する

## 更新

1. コードを直したら `sw.js` の `CACHE_VERSION` を上げて（例: `'v1'` → `'v2'`）push する
2. タブレットをネットにつないだ状態でアプリを開くと、新しい版を取り込んで自動で読み込み直す
   （反映されなければアプリを一度閉じて開き直す）。途中の対局はそのまま続く

ファイルを足したときは `sw.js` の `FILES` にも足す（入れ忘れるとオフラインでそのファイルが読めない）。

## 開発用のコマンド

Node.js（v20 以降）が要る。

```bash
npm test
```

ルールエンジンのテスト（perft 深さ 1〜4、二歩・打ち歩詰め・行き所のない駒・千日手・連続王手の千日手・手合いなど）。

```bash
npm install
```

```bash
npx playwright install chromium
```

```bash
npm run screenshot
```

800×1280 と 1200×1920 の縦向き画面で、主な場面のスクリーンショットを `tests/screenshots/` に撮る。

```bash
node tests/serve.mjs 8123
```

手元のブラウザで `http://localhost:8123/` を開いて確認する（駒の一覧は `http://localhost:8123/tests/pieces.html`）。

```bash
node tests/make-icons.mjs
```

アイコン（`icons/*.png`）を作り直す。
