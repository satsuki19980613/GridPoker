# CLAUDE.md — Grid Poker

このリポジトリで作業するセッションが最初に読む文書。

## 1. 概要

- **アプリ**: Grid Poker。5×5 の盤面の 10 本のライン（行 1〜5・列 a〜e）を、それぞれ独立した pot として同時に戦うポーカー。
  ハンドは常に 4 枚。1 枚置いて 1 枚引く。ライン完成で 1 ラウンドだけ betting し、showdown はハンド 2 枚＋ボード 3 枚のベスト 5。
- **モード**: VS CPU（ログイン不要。ブラウザ内で完結）／ VS Player（Google ログイン。サーバーが進行を管理）／ Ranking。
- **リポジトリ**: https://github.com/satsuki19980613/GridPoker.git
- **体制**: さつき＝デザイナー兼意思決定者。実装は Claude。判断が分かれる点は推測で進めず、さつきに確認する。
- 技術の構成は WWYD（`../WWYD`）を踏襲する（Neon・Managed Better Auth の Google ログイン・Data API・Neon Functions・Cloudflare Pages と認証の中継）。

## 2. 技術構成

| 区分 | 内容 |
|---|---|
| フロント | Vite＋素の JavaScript（ES modules）。`index.html`・`src/style.css`・`src/main.js` |
| ルール | `src/engine.js`（純粋なロジック。ブラウザとサーバーの両方が import する**唯一の実装**）。CPU は `src/cpu.js` |
| 見せてよい情報 | `src/view.js` の `viewFor(g, seat)`（山札・相手のハンド・相手の伏せカード・相手専用のログを除く） |
| DB | Neon プロジェクト `grid-poker`（`autumn-lake-10711919`、シンガポール、Postgres 18）。ブランチ `production`（本番）・`dev`（開発） |
| ログイン | Neon Auth（Managed Better Auth）の Google。自サイトの `/api/auth/*` から中継してクッキーを自サイトのものにする（`src/authProxy.js`。本番は `functions/api/auth/[[path]].js`、開発は `vite.config.js` の proxy） |
| 読み取り | Neon Data API の RPC（`me`・`set_nickname`・`lobby_poll`・`game_poll`・`ranking`）。表には直接触れさせない（RLS 有効・権限なし） |
| 手の処理 | Neon Function `game`（`server/game/`。`match`・`act`・`timeout`・`resign`）。DB の所有者として 1 リクエスト 1 トランザクション、ゲーム行をロック |
| ホスティング | Cloudflare Pages（`gridpoker.pages.dev`）。ヘッダーは `public/_headers` |

### ゲーム設定（全ゲーム共通・固定。2026-10-02 さつき）

- **Stack 200・Ante 5（全 10 line に各 5）・Min raise NL・先手／後手ランダム**。VS CPU も VS Player も同じで、変更する画面は無い。
- **終局**: 25 マスが埋まったら stack の多い方の勝ち。途中で stack が 0 になったら、完成したラインがすべて決着した時点（showdown の後）で終了し、0 になった側の負け（2026-10-02 さつき）。残りのラインの ante はそのまま（精算しない）。
- Min raise NL＝そのラインでこれまでの最大の raise 幅以上（最低は ante 額の 5）。Pot Limit の上限・相手が cover できない額は不可、は従来どおり。
- 実装は `src/engine.js` の `RULES`（`newGame` の既定値。サーバーの `PVP_CFG` も同じもの）。ルールのモーダル（`index.html`）にも同じ内容を書く。

### VS Player の決まり（`server/game/rules.js`）

- 1 アクション 60 秒（ライン完成時は +6 秒）。時間切れは相手のクライアントが申告し、サーバーが代わりに指す（ランダムに配置／check か fold）。3 回連続で負け。
- Rating は Elo（初期 1500・K=32）。投了・時間切れ負けも 1 敗。
- ゲームの記録は最後の変更から 7 日で削除（終局・放置とも。Rating と勝敗数は残る）。定期実行は使わず、`me()`（ログイン・起動時）と `lobby_poll`（約 20 回に 1 回）が `purge_old_games()` を呼ぶ。
- 同期はポーリング（相手の手番 1 秒・自分の手番 2.5 秒・待機中 2 秒）。Data API の `game_poll` は版が新しいときだけビューを返す。

## 3. コマンド

| 目的 | コマンド |
|---|---|
| セットアップ | `npm install`。Neon CLI のログインは `npx neonctl auth` |
| 開発サーバー | `npm run dev`（http://localhost:5173、Neon の `dev` ブランチ） |
| 手元で本番につなぐ | `npm run dev:prod`（本番のデータを書き換えるので確認だけに使う） |
| 単体テスト | `npm test` |
| ビルド | `npm run build`（`dist/`） |
| マイグレーション | `npm run db:migrate -- --branch dev`（本番は `--branch production`、**さつきの確認後**） |
| 結合テスト（dev） | `node scripts/itest.mjs --branch dev`（試験ユーザー 2 人で待機→対戦→終局→レーティング。後片付けあり） |
| Function の配備 | `npm run deploy:game -- --branch dev`（本番は `--branch production`、**さつきの確認後**）。URL は `.env.*` の `VITE_GAME_URL` と `public/_headers` |

## 4. 規約

- 画面に説明文を出さない。説明はルールのモーダルに集める。ルールのモーダルは、ガイドアニメ（`src/guide.js`。小さな盤面で 8 段階をループ再生）と固定設定・VS Player の表。ルールを変えたらガイドの手順と文言も合わせる。ポーカー用語は英語（Fold / Call / Raise / Line b など）。
- 画面の大きさは `src/main.js` の `fitTable` が実測で決める（はみ出さない最大のマス `--cell` と手札 `--hw`）。スマホは `body.compact`、横向きのスマホ・タッチのタブレットは盤面左・操作右の `body.side`。PC（マウス）は縦 1 列のまま。確認は開発サーバーで 320×568〜1366×600 の各サイズ（`?fake` で VS Player、`?touch` でタッチ扱い）。
- 角は直角。色は YOU #336B87・相手 #FE7A47。トークンは `src/style.css` の `:root`。
- ルールを変えるときは `src/engine.js` だけを直し、`npm test` と結合テストを通す。サーバーとブラウザで二重に実装しない。
- 秘密情報（DB の接続文字列など）はコミットしない。`.env.development` / `.env.production` は公開の住所だけ。
- マイグレーションは追加のみ（適用済みのファイルは書き換えない）。

## 5. さつきに確認が必要な操作

`git push`、本番（`production`）へのマイグレーション・Function の配備、Neon・Cloudflare・Google の設定変更、依存ライブラリの追加、データの削除。
