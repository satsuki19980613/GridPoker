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

- **フリーズアウト・初期 Stack 200・初回 Ante 5（盤面ごとに 2 倍）・No Limit・Min raise NL・先手／後手ランダム（以後は盤面ごとに交代）**。VS CPU も VS Player も同じで、変更する画面は無い。
- **フリーズアウト**（2026-10-02 さつき。それまでは 25 マス 1 盤面で stack の多い方の勝ち）: 1 盤面＝25 マス。埋まったら stack を持ち越して次の盤面へ。どちらかが負けるまで盤面を繰り返す。
  - Ante は盤面ごとに 2 倍（5 → 10 → 20 → 40 …、全 10 line に各額）。短い方の stack が ante × 10 に足りないときは、持っている分を Line 1 から順に（Line 1〜5 → a〜e）ante 額ずつ置いて all-in（最後の 1 本は残り全部）。相手も line ごとに同額だけ置くので、届かなかった line は pot なしで始まる（2026-10-03 さつき）。
  - **負け**（2026-10-03 さつき）: all-in して showdown で負け、手元が 0 になったとき。未決着の line の pot にチップが残っていてもその場で終局し、残りの pot は勝った側へ。ante で手元が 0 になっただけ（盤面の始めの all-in）なら、自分のチップがある line で負けるまで続く（betting なしで showdown）。判定は line が決着するたび（盤面の途中でも終局する）。
    - それまでは「手元と pot の合計が 0 になったら負け」で、all-in で負けても他の line に ante が残っていれば続いていた。実機で「all-in を call されて負けたのに次の配置に進む」のは不自然だったため変更。
  - Ante 不足の扱いの検証（CPU 同士 450 局、2026-10-03）: 「stack 0 で即負け」は逆転率 2.3%。「短い方の stack ÷ 10 に下げて全 line に均等」は逆転率 17.8% だが、all-in の短い方が 10 本に分散して生き残り、盤面数の中央値 4・最長 27 と長すぎた。「Line 1 から順に満額」は逆転率 12.9%・勝率変動の合計 1.23（即負けは 0.78）・リード交代 1.65、盤面数の中央値 3・最長 7。CPU が常に call する相手に 98%、毎回 all-in する相手に 89% 勝つ。均等配分は engine の `anteMode: 'even'` で比較用に残す。
  - 理由: 25 マスで終わる形式では、リードが「残りラインの ante × 2」を超えると check／fold だけで勝ちが確定し、逆転できない局面が CPU 同士で 53〜59% の対局に生じた（1 盤面では ante をどう配分しても避けられない）。Ante が毎盤面払われ増えていくので、fold で逃げ続けてもリードは必ず削られ、逆転不能の局面がなくなる。
  - 初期 Stack 200・初回 Ante 5（初回 ante 合計＝stack の 25%）の根拠: 比 5〜40% を CPU 同士各 300 局で比較し、勝率変動の合計（excitement）と逆転率が最大で、実力（CPU が常に call する相手に 96% 勝ち）と、毎回 all-in する相手への勝率 17.5% の両方を満たした。平均 2.0 盤面（約 43 手）。約 4 割は 1 盤面目で決着（No Limit の all-in の性質）。
  - 実装は `src/engine.js` の `startBoard` / `endBoard` / `finish(g, bust, reason)`（`g.bust` に負けた席、`g.bustReason` は 'chips'（'ante' は比較用の均等配分のときだけ））。盤面の切り替わりは popup（type 'board'）で知らせる。ルールのモーダル（設定・勝敗の表とガイド 01・08・09）も同じ内容。
- **No Limit**（2026-10-02 さつき。それまでは Pot Limit）: bet / raise の上限は all-in。ただし相手が cover できる額まで（自分と相手の stack の小さい方＝effective stack）。fold されたら、call されなかった分は bet した側に戻り、pot は突き合わせた額（結果の表示もこの額）。
  - 自己対戦 1,000 局ずつ（2026-10-02）: CPU 同士で途中終局（stack 0）が Pot Limit 21% → No Limit 41%、決着ライン平均 9.0 → 7.8 本。毎回 all-in する相手に CPU は 81% 勝ち、先手の勝率は 47〜51%。破綻はないが短期決着が増える。調整案（未決定）: Stack を増やす、1 ラインの上限を設ける など。
- Min raise NL＝そのラインでこれまでの最大の raise 幅以上（最低はその盤面の ante 額）。残りがそれ未満なら、その額の all-in は可。
- 画面とログの bet 額は ante を除いた額（engine の `to` − その line の ante）。Bet のモーダルは Pot 50%／100%／150%、Raise のモーダルは相手の bet の ×2／×3／×4、どちらもスライダーは 5 刻み＋All-in（2026-10-03 さつき）。
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

- 画面に説明文を出さない。説明はルールのモーダルに集める。ルールのモーダルは、ガイドアニメ（`src/guide.js`。小さな盤面で 9 段階をループ再生）と固定設定・VS Player の表。ルールを変えたらガイドの手順と文言も合わせる。ポーカー用語は英語（Fold / Call / Raise / Line b など）。
- 画面の大きさは `src/main.js` の `fitTable` が実測で決める（はみ出さない最大のマス `--cell` と手札 `--hw`）。スマホは `body.compact`、横向きのスマホ・タッチのタブレットは盤面左・操作右の `body.side`。PC（マウス）は縦 1 列のまま。確認は開発サーバーで 320×568〜1366×600 の各サイズ（`?fake` で VS Player、`?touch` でタッチ扱い）。
- 角は直角。色は YOU #336B87・相手 #FE7A47。トークンは `src/style.css` の `:root`。
- ルールを変えるときは `src/engine.js` だけを直し、`npm test` と結合テストを通す。サーバーとブラウザで二重に実装しない。
- 秘密情報（DB の接続文字列など）はコミットしない。`.env.development` / `.env.production` は公開の住所だけ。
- マイグレーションは追加のみ（適用済みのファイルは書き換えない）。

## 5. さつきに確認が必要な操作

`git push`、本番（`production`）へのマイグレーション・Function の配備、Neon・Cloudflare・Google の設定変更、依存ライブラリの追加、データの削除。
