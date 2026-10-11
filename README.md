# Grid Poker

[![CI](https://github.com/satsuki19980613/GridPoker/actions/workflows/ci.yml/badge.svg)](https://github.com/satsuki19980613/GridPoker/actions/workflows/ci.yml)
[![Live](https://github.com/satsuki19980613/GridPoker/actions/workflows/live.yml/badge.svg)](https://github.com/satsuki19980613/GridPoker/actions/workflows/live.yml)
[![CodeQL](https://github.com/satsuki19980613/GridPoker/actions/workflows/codeql.yml/badge.svg)](https://github.com/satsuki19980613/GridPoker/actions/workflows/codeql.yml)

5×5 の盤面の 10 本のライン（行 1〜5・列 a〜e）で勝負するポーカー。

サイト：https://gridpoker.pages.dev/

- **VS CPU** — ログイン不要。対局はブラウザの中だけで進む。
- **VS Player** — Google でログインし、待機中のプレイヤーと対戦。
- **Ranking** — VS Player の Rating（Elo）。

## ルール（要約）

- 設定は固定: フリーズアウト・初期 Stack 200・初回 Ante 5（ラインごとに完成時に後払い、盤面ごとに 2 倍）・No Limit・Min raise NL・先手／後手はランダム（以後は盤面ごとに交代）。
- ハンドは常に 4 枚。1 枚を空きマスに伏せて置き、すぐ 1 枚 draw。
- 5 枚目でライン完成。ボードをオープンし、両者がそのラインの ante を払ってから 1 ラウンドだけ betting（No Limit。上限は相手が cover できる額までの all-in。fold されたら call されなかった分は戻る）。bet 額は ante を除いた額で示し、Bet は Pot 50%／100%／150%、Raise は相手の bet の ×2／×3／×4、ほかに 5 刻みの任意の額と all-in。
- showdown はハンドから 2 枚＋ボードから 3 枚のベスト 5。
- 25 マスで 1 盤面。stack を持ち越して次の盤面へ（ante は 2 倍）。
- line が決着した時点で手元が 0 なら、その場で負け。ante が足りなければ、持っている分だけ払って all-in（相手も同額）。

## 安全とプライバシー

### ひと目で

- **VS CPU は、何もサーバーに送りません。** ログインも不要で、対局はブラウザの中だけで進みます。
- **対戦相手に、あなたのハンドと伏せたカードは見えません。** 山札も見えません（ラインの完成で公開されたカードを除く）。
- **あなたの席で手を指せるのは、ログインしたあなただけです。** サーバーがリクエストごとに確かめます。
- **課金・広告・アクセス解析はありません。** このサイト以外のスクリプトは動かない設定です。
- **ここに書いたことは、自動の確認で確かめ続けています。** 結果は誰でも見られます（上のバッジ）。

一方で、**VS Player にログインすると、Google のメールアドレス・表示名・プロフィール画像はログインの仕組み（Neon Auth）のデータベースに保存され、運営者はそれを見ることができます。** 対局の中身（山札・両者のハンド）も、サーバーが対局を進める仕組みのため運営者は見られます。運営者を信頼できる相手と遊ぶアプリです。

以下は、その詳しい中身と根拠です。

### 扱う情報の一覧

VS CPU だけで遊ぶ場合、下の表のどれもサーバーには届きません。

| 情報 | サーバーに保存されるもの | 運営者が見られるか | ほかのプレイヤーに見えるか |
|---|---|---|---|
| メールアドレス | 保存する（Neon Auth が、ログインの記録として） | 見られる | 見えない |
| Google の表示名（氏名）・プロフィール画像 | 保存する（Neon Auth が。アプリでは使わない） | 見られる | 見えない |
| IP アドレス・ブラウザの種類 | 保存する（Neon Auth が、ログインの記録として） | 見られる | 見えない |
| Google のトークン | 保存する（Neon Auth が。アプリでは使わない） | 見られる | 見えない |
| Google がアカウントごとに発行する番号 | 保存する（次のログインで同じ人だと見分けるため） | 見られる | 見えない |
| ニックネーム（自分で付ける。最初は `Player-XXXX`） | 保存する | 見られる | 見える（待機の一覧・対局・Ranking） |
| Rating・勝敗の数 | 保存する | 見られる | 見える（待機の一覧・Ranking） |
| 対局の記録（山札・両者のハンドを含む） | 保存する（最後の変更から 7 日で消える） | 見られる | 自分のハンドと、公開されたカードだけ |
| VS CPU の対局 | **保存しない**（ブラウザの中だけ） | 見られない | 見えない |
| 画面の明るさの設定 | **保存しない**（自分の端末にだけ置く） | 見られない | 見えない |

外部のサービスに届くもの：

- **Google** — VS Player にログインするとき。
- **Cloudflare**（サイト）・**Neon**（サーバーとデータベース） — 通信を中継するので、接続の情報（IP アドレスなど）が届く。
- フォントはこのサイトから配っているので、開いただけで Google に通信することはない。

### 期待できること・できないこと

期待できること：

- 対戦相手に、自分のハンド・伏せたカード・山札を見られない。
- 他人に、自分の席で手を指されたり、投了や時間切れを申告されたりしない。
- 他人に、ニックネームや Rating を書き換えられない。
- 時間切れの申告は、締め切りを過ぎるまでサーバーが受け付けない。

期待できないこと（限界）：

- **運営者は、メールアドレス・表示名・プロフィール画像・IP アドレスと、対局の中身を見られる。** どれもサーバーのデータベースにあり、運営者は読める。
- **リクエストの回数は制限していない。** 連打や大量のリクエストへの備えは、Cloudflare と Neon の側の仕組みだけ。
- **1 人が複数の Google アカウントで遊ぶことは防げない。** Rating はアカウントごと。
- **外部のサービス（Google・Cloudflare・Neon）がどう扱うかは、それぞれの規約による。**
- **第三者による監査は受けていない。** 個人で運営していて、確かめているのは下の自動の確認だけ。

### 仕組みと根拠

想定している相手は、相手のハンドを覗こうとする対戦相手、他人の対局や Rating に手を出そうとするプレイヤー、そして Web の一般的な攻撃です。ブラウザは信用しません。VS Player では、ルールの判定もカードを配るのもサーバーが行い、ブラウザにはその席が見てよいものだけを送ります。ルールはブラウザとサーバーで同じ 1 つの実装を使います。

| 守ること | 仕組み | 根拠 |
|---|---|---|
| ハンドと山札を見せない | 相手のハンド・相手の伏せたカード・山札・相手専用のログはブラウザに送らない。席ごとに見てよいものだけを作って保存し、本人の分だけを返す | [src/view.js](src/view.js)（`viewFor`）・[test/server.test.js](test/server.test.js)・[20261002000000_init.sql](db/migrations/20261002000000_init.sql)（`game_poll`） |
| 表を直接読ませない | データベースの表はブラウザから直接読めない（RLS 有効・権限なし）。決まった関数だけが、ログインした本人の分を返す | [20261002000000_init.sql](db/migrations/20261002000000_init.sql)。本番で表を直接読めないことを確かめる [scripts/live-check.mjs](scripts/live-check.mjs) |
| ログインした本人だけが操作できる | サーバーがリクエストごとに、ログインの署名・発行元・期限を確かめ、その対局のその席の人かを確かめる。通信に使うトークンはページを開いている間だけメモリに持ち、ブラウザの保存領域には置かない。ログインの Cookie はこのサイトの中継（`/api/auth`）を通し、決まったパスだけを中継する | [server/game/index.js](server/game/index.js)・[server/game/handler.js](server/game/handler.js)・[src/net.js](src/net.js)・[src/authProxy.js](src/authProxy.js) |
| 手の順番と時間を守らせる | 1 リクエスト 1 トランザクションで対局をロックし、版・手番・合法手・締め切りを確かめてから進める | [server/game/rules.js](server/game/rules.js)・[server/game/db.js](server/game/db.js)・[scripts/itest.mjs](scripts/itest.mjs) |
| ほかの人の名前で画面を乗っ取られない | ニックネームなどは表示する前に無害化する。さらに、このサイト以外のスクリプトは動かない設定にしている | [src/main.js](src/main.js)（`esc`）・[public/_headers](public/_headers) |
| カードの並びを予測されない | 山札のシャッフルに、予測できない乱数（`crypto.getRandomValues`）を使う | [src/engine.js](src/engine.js) |
| 鍵やパスワードを漏らさない | リポジトリには公開の住所だけを置く。データベースの接続文字列は使うときに取り出し、表示も保存もしない | [.env.example](.env.example)・[scripts/neon.mjs](scripts/neon.mjs) |

### 自動の確認

このページの上のバッジは、次の確認に通っていることを示します（安全を保証するものではありません）。

| 確認 | 何を確かめているか | いつ |
|---|---|---|
| [CI](https://github.com/satsuki19980613/GridPoker/actions/workflows/ci.yml) | テスト（相手のハンドが漏れないこと・サーバーの受け付け方を含む）とビルド | コードを変えるたび |
| [Live](https://github.com/satsuki19980613/GridPoker/actions/workflows/live.yml) | 本番のサイトとサーバーに届くか、ログインせずに読めるものが無いか、保護ヘッダ。Neon の設定があれば、開発用の環境で試験ユーザー 2 人の 1 局 | 毎週と、サーバーを変えたとき |
| [CodeQL](https://github.com/satsuki19980613/GridPoker/actions/workflows/codeql.yml) | GitHub 公式のコードスキャン（危ない書き方が無いか） | コードを変えるたびと毎週 |
| [Mozilla HTTP Observatory](https://developer.mozilla.org/en-US/observatory/analyze?host=gridpoker.pages.dev) | 公開しているサイトの保護ヘッダ。**A+**（125 点、12 項目すべて合格。2026-10-11 に測定）。Live が毎回測り、A+ でなければ失敗にする | リンク先でいつでも測り直せる |

### 問題を見つけたら

[SECURITY.md](SECURITY.md) を見てください。このリポジトリの Security タブから、公開されない形で運営者に知らせることができます。

### この節の書き方について

読む人が確かめやすいよう、次の考え方に沿って書いています。

- **大事なことを先に短く、詳しいことは後ろに**（英国の個人情報保護機関 ICO の「[段階的に示す](https://ico.org.uk/for-organisations/uk-gdpr-guidance-and-resources/individual-rights/the-right-to-be-informed/what-methods-can-we-use-to-provide-privacy-information/)」考え方）
- **扱う情報を決まった形の表にする**（カーネギーメロン大学の[プライバシーの「栄養成分表示」の研究](https://doi.org/10.1145/1753326.1753561)。Apple や Google のアプリストアの表示も同じ考え方）
- **期待できること・できないことを両方書き、想定する相手と対策の根拠を示す**（[OpenSSF Best Practices](https://www.bestpractices.dev/en/criteria/1) の基準）
- **知らせ方を用意し、動かしている検査を示す**（[GitHub のリポジトリのベストプラクティス](https://docs.github.com/en/repositories/creating-and-managing-repositories/best-practices-for-repositories)）

## 開発

- 開発：`npm install && npm run dev` → http://localhost:5173/ （`?fake` でサーバー無しの VS Player）
- 構成とコマンド：[CLAUDE.md](CLAUDE.md)
