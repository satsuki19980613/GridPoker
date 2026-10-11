# CLAUDE.md — Grid Poker

このリポジトリで作業するセッションが最初に読む文書。

## 1. 概要

- **アプリ**: Grid Poker。5×5 の盤面の 10 本のライン（行 1〜5・列 a〜e）で勝負するポーカー。line が完成したときに両者が ante を払い、その line だけが pot になって、すぐ決着する。実際に争う pot は常にひとつ（1 枚で 2 本が完成したときだけ 2 つ）。盤面の 10 個の枠は「これから pot になる line」（2026-10-03 さつき）。
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
| 個人の情報 | Neon Auth が書くメールアドレス・表示名・画像・Google のトークン・IP アドレス・ブラウザの種類は、DB のトリガーが書き込みのたびに置き換えて残さない（`db/migrations/20261011000000_auth_scrub.sql`。privatematch と同じ。2026-10-11 さつき）。アプリはどれも使わない（表示は `profiles.nickname`） |
| 読み取り | Neon Data API の RPC（`me`・`set_nickname`・`lobby_poll`・`game_poll`・`ranking`）。表には直接触れさせない（RLS 有効・権限なし） |
| 手の処理 | Neon Function `game`（`server/game/`。`match`・`act`・`timeout`・`resign`）。DB の所有者として 1 リクエスト 1 トランザクション、ゲーム行をロック |
| ホスティング | Cloudflare Pages（`gridpoker.pages.dev`）。ヘッダーは `public/_headers` |
| 自動の確認 | GitHub Actions。`ci.yml`（`npm test`・ビルド）・`live.yml`（本番に届くか・ログインせずに読めるものが無いか・Mozilla HTTP Observatory が A+ か＝`scripts/live-check.mjs`。Variable `NEON_PROJECT_ID` と Secret `NEON_API_KEY` があれば本番の DB に個人の情報が残っていないか＝`scripts/auth-audit.mjs` と、dev で結合テストも）・`codeql.yml`。README のバッジ。脆弱性の知らせ方は `SECURITY.md` |

### ゲーム設定（全ゲーム共通・固定。2026-10-02 さつき）

- **フリーズアウト・初期 Stack 200・初回 Ante 5（line の完成時に後払い・盤面ごとに 2 倍）・No Limit・Min raise NL・先手／後手ランダム（以後は盤面ごとに交代）**。VS CPU も VS Player も同じで、変更する画面は無い。
- **フリーズアウト**（2026-10-02 さつき。それまでは 25 マス 1 盤面で stack の多い方の勝ち）: 1 盤面＝25 マス。埋まったら stack を持ち越して次の盤面へ。どちらかが負けるまで盤面を繰り返す。
  - **Ante は後払い**（2026-10-03 さつき）: 盤面の始めには何も払わない（どの line の pot も空で始まる）。line が完成したとき、その betting の前に、両者がその line の ante を払う。額は盤面ごとに 2 倍（5 → 10 → 20 → 40 …）。手元が ante に足りない側は持っている分だけ払って all-in になり、相手も同額だけ払う（払う額＝min(ante, 両者の stack)）。1 枚で 2 本が完成したときは、それぞれの line の betting が始まるときに払う（行→列の順。1 本目で all-in になれば 2 本目は 0）。
  - **負け**（2026-10-03 さつき）: line が決着した時点（showdown か fold。同時に完成した line はすべて決着した後）で手元（stack）が 0 のとき。後払いなので、このとき未決着の line の pot にチップは残っておらず、手元 0 は「チップがどこにもない」と同じ。chop で半分戻れば手元は 0 でないので続く。両者 0（引き分け）は起きない。判定は line が決着するたび（盤面の途中でも終局する）。
    - 考え方（さつき）: ante は参加料で、払った時点でどちらのチップでもない。betting は 5 枚目が置かれて line が完成したときにしか起きず、betting が起きた line の pot は必ずどちらかのもの（chop なら折半）になる。だからカードを置く段階のプレイヤーが持っているのは「置く権利」だけで、手元（stack）が全損したら負け。参加料は、その line の勝負に入るとき（完成時）に払う。
    - 経緯: 2026-10-02 は全 10 line に ante を前払いし、短い方の stack が足りなければ Line 1 から順に満額ずつ置いて all-in（`anteMode: 'fill'`）。前払いでは未決着の pot にチップが残るため、「all-in を call されて負けたのに次の配置に進む」「手元 0 のまま配置する」「終局時に残った pot を勝った側へ移す」「両者 0 で引き分け」といった例外が生じた（実機テストで指摘）。後払いにするとこれらがすべてなくなる。
    - 前払いとの比較（CPU 同士 各 1,200 局、強さは相手別に各 400 局、2026-10-03）: 前払い→後払いで、手元 0 のまま配置した局 41%→0、終局時に pot を移した局 88%→0、引き分け 1→0。盤面数の中央値 2→2・平均 1.95→1.88・最長 9→5、1 盤面目で決着 41%→47%、逆転率（勝者が途中でチップの 1/3 以下になった局）5.8%→8.6%、リード交代 1.40→1.56、勝率変動の合計 0.94→0.89、先手の勝率 49.5%→47.6%。CPU が常に call する相手に 95.0%→94.0%、毎回 all-in する相手に 84.0%→84.3%（この比較の指標の定義は下の 2026-10-02・10-03 前半の検証とは異なる）。
    - `anteMode` の `'fill'`（前払い・Line 1 から順）と `'even'`（前払い・短い方の stack ÷ 10 に下げて均等）は比較用に残す。前払いで始まった VS Player の対局は、保存された `cfg.anteMode` のまま最後まで前払いで進む。
  - 前払いの頃の ante 不足の扱いの検証（CPU 同士 450 局、2026-10-03）: 「stack 0 で即負け」は逆転率 2.3%。「短い方の stack ÷ 10 に下げて全 line に均等」は逆転率 17.8% だが、盤面数の中央値 4・最長 27 と長すぎた。「Line 1 から順に満額」は逆転率 12.9%・勝率変動の合計 1.23・リード交代 1.65、盤面数の中央値 3・最長 7。
  - 理由: 25 マスで終わる形式では、リードが「残りラインの ante × 2」を超えると check／fold だけで勝ちが確定し、逆転できない局面が CPU 同士で 53〜59% の対局に生じた（1 盤面では ante をどう配分しても避けられない）。Ante が毎盤面（全 line の完成で）払われ増えていくので、fold で逃げ続けてもリードは必ず削られ、逆転不能の局面がなくなる。
  - 初期 Stack 200・初回 Ante 5（初回 ante 合計＝stack の 25%）の根拠: 比 5〜40% を CPU 同士各 300 局で比較し、勝率変動の合計（excitement）と逆転率が最大で、実力（CPU が常に call する相手に 96% 勝ち）と、毎回 all-in する相手への勝率 17.5% の両方を満たした。平均 2.0 盤面（約 43 手）。約 4 割は 1 盤面目で決着（No Limit の all-in の性質）。
  - 実装は `src/engine.js` の `startBoard` / `startCompletion`（後払いの ante）/ `afterCompletions`（負けの判定）/ `endBoard` / `finish(g, bust, reason)`（`g.bust` に負けた席、`g.bustReason` は 'chips'（'ante' は比較用の均等配分のときだけ））。前払いの対局で未決着の pot を勝った側へ移したときは `g.left` に記録し、結果一覧に出す。盤面の切り替わりは popup（type 'board'）で知らせる。ルールのモーダル（設定・勝敗の表とガイド 01・04・05・08・09）も同じ内容。
- **No Limit**（2026-10-02 さつき。それまでは Pot Limit）: bet / raise の上限は all-in。ただし相手が cover できる額まで（自分と相手の stack の小さい方＝effective stack）。fold されたら、call されなかった分は bet した側に戻り、pot は突き合わせた額（結果の表示もこの額）。
  - 自己対戦 1,000 局ずつ（2026-10-02）: CPU 同士で途中終局（stack 0）が Pot Limit 21% → No Limit 41%、決着ライン平均 9.0 → 7.8 本。毎回 all-in する相手に CPU は 81% 勝ち、先手の勝率は 47〜51%。破綻はないが短期決着が増える。調整案（未決定）: Stack を増やす、1 ラインの上限を設ける など。
- Min raise NL＝そのラインでこれまでの最大の raise 幅以上（最低はその盤面の ante 額）。残りがそれ未満なら、その額の all-in は可。
- 画面とログの bet 額は ante を除いた額（engine の `to` − その line の ante）。Bet のモーダルは Pot 50%／100%／150%、Raise のモーダルは相手の bet の ×2／×3／×4、どちらもスライダーは 5 刻み＋All-in（2026-10-03 さつき）。
- 実装は `src/engine.js` の `RULES`（`newGame` の既定値。サーバーの `PVP_CFG` も同じもの）。ルールのモーダル（`index.html`）にも同じ内容を書く。

### VS Player の決まり（`server/game/rules.js`）

- 1 アクション 60 秒（ライン完成時は +6 秒）。時間切れは相手のクライアントが申告し、サーバーが代わりに指す（ランダムに配置／check か fold）。3 回連続で負け。
- Rating は Elo（初期 1500・K=32）。投了・時間切れ負けも 1 敗。そのとき未決着の line に入っていたチップ（betting 中の掛け金など）は、それぞれの手元に戻してから終局する（終局時の stack の合計は常に 400）。
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
| DB のテスト | `TEST_DATABASE_URL=postgres://... npm test`（手元の Postgres に `scripts/test-db-stub.sql` と `db/migrations/*.sql` を当てておく。CI は自動。無ければ飛ばす） |
| 結合テスト（dev） | `node scripts/itest.mjs --branch dev`（試験ユーザー 2 人で待機→対戦→終局→レーティング。後片付けあり） |
| Function の配備 | `npm run deploy:game -- --branch dev`（本番は `--branch production`、**さつきの確認後**）。URL は `.env.*` の `VITE_GAME_URL` と `public/_headers` |
| 本番の通信確認 | `node scripts/live-check.mjs`（環境変数 `SITE`・`AUTH_URL`・`DATA_URL`・`GAME_URL`。読み取りだけ。Actions の Live から走る） |

## 4. 規約

- 画面に説明文を出さない。説明はルールのモーダルに集める。ルールのモーダルは、ガイドアニメ（`src/guide.js`。小さな盤面で 9 段階をループ再生）と固定設定・VS Player の表。ルールを変えたらガイドの手順と文言も合わせる。ポーカー用語は英語（Fold / Call / Raise / Line b など）。
- 画面の大きさは `src/main.js` の `fitTable` が実測で決める（はみ出さない最大のマス `--cell` と手札 `--hw`）。スマホは `body.compact`、横向きのスマホ・タッチのタブレットは盤面左・操作右の `body.side`。PC（マウス）は縦 1 列のまま。確認は開発サーバーで 320×568〜1366×600 の各サイズ（`?fake` で VS Player、`?touch` でタッチ扱い）。
- 角は直角。色は YOU #336B87・相手 #FE7A47。トークンは `src/style.css` の `:root`。
- ルールを変えるときは `src/engine.js` だけを直し、`npm test` と結合テストを通す。サーバーとブラウザで二重に実装しない。
- 扱う情報・見せる範囲・ヘッダーなどの仕組みを変えたら、README の「安全とプライバシー」（表と根拠のリンク）も合わせる。
- 秘密情報（DB の接続文字列など）はコミットしない。`.env.development` / `.env.production` は公開の住所だけ。
- マイグレーションは追加のみ（適用済みのファイルは書き換えない）。

## 5. さつきに確認が必要な操作

`git push`、本番（`production`）へのマイグレーション・Function の配備、Neon・Cloudflare・Google の設定変更、依存ライブラリの追加、データの削除。
