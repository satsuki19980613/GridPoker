# Grid Poker

[![CI](https://github.com/satsuki19980613/GridPoker/actions/workflows/ci.yml/badge.svg)](https://github.com/satsuki19980613/GridPoker/actions/workflows/ci.yml)
[![Live](https://github.com/satsuki19980613/GridPoker/actions/workflows/live.yml/badge.svg)](https://github.com/satsuki19980613/GridPoker/actions/workflows/live.yml)
[![CodeQL](https://github.com/satsuki19980613/GridPoker/actions/workflows/codeql.yml/badge.svg)](https://github.com/satsuki19980613/GridPoker/actions/workflows/codeql.yml)
[![Secrets](https://github.com/satsuki19980613/GridPoker/actions/workflows/secrets.yml/badge.svg)](https://github.com/satsuki19980613/GridPoker/actions/workflows/secrets.yml)

5×5 の盤面の 10 本のライン（行 1〜5・列 a〜e）で勝負する 1 対 1 のポーカー。

**公開サイト**：https://gridpoker.pages.dev/

## 機能

- **VS CPU** — ログイン不要。対局はブラウザ内で完結する。
- **VS Player** — Google でログインし、待機中のプレイヤーと対戦する。
- **Ranking** — VS Player の Rating（Elo）。

## ルール（要約）

- 設定は固定：フリーズアウト、初期 Stack 200、初回 Ante 5（ライン完成時に後払い。盤面ごとに 2 倍）、No Limit、Min raise NL。先手／後手はランダムに決め、以後は盤面ごとに交代する。
- ハンドは常に 4 枚。1 枚を空きマスに伏せて置き、直後に 1 枚 draw する。
- 5 枚目でライン完成。ボードを公開し、両者がそのラインの ante を払ったうえで betting を 1 ラウンド行う。上限は相手が cover できる額までの all-in。fold された場合、call されなかった額は返還する。
- bet 額は ante を除いた額で表示する。Bet は Pot の 50%／100%／150%、Raise は相手の bet の ×2／×3／×4 を選べるほか、5 刻みの任意額と all-in を指定できる。
- showdown はハンド 2 枚＋ボード 3 枚のベスト 5。
- 25 マスで 1 盤面。stack を持ち越して次の盤面に進む（ante は 2 倍）。
- line の決着時点で stack が 0 なら負け。ante に満たない場合は手持ち全額を払って all-in となり、相手も同額を払う。

## セキュリティとプライバシー

### 要約

- **メールアドレス・氏名・プロフィール画像・IP アドレスを保存しない。** 運営者も閲覧できない。
- **VS CPU はサーバーに何も送信しない。** ログイン不要で、対局はブラウザ内で完結する。
- **対戦相手には、自分のハンド・伏せたカード・山札が見えない**（ライン完成で公開されたカードを除く）。
- **自分の席を操作できるのはログインした本人だけである。** サーバーがリクエストごとに検証する。
- **課金・広告・アクセス解析は無い。** 自サイト以外のスクリプトは実行されない設定である。
- **以上の内容は自動検証で継続的に確認している。** 結果は上部のバッジで公開している。

**制約**：運営者は対局の内容（山札・両者のハンド）を閲覧できる。サーバーが対局を進行させる設計のためである。運営者を信頼できる利用者に向けたアプリである。

### 取り扱う情報

VS CPU のみで遊ぶ場合、下表の情報はいずれもサーバーに送信されない。

| 情報 | サーバーへの保存 | 運営者による閲覧 | 他のプレイヤーへの表示 |
|---|---|---|---|
| メールアドレス | **保存しない**（実在しない宛先 `<ランダムな ID>@gridpoker.invalid` に置換） | 不可 | 不可 |
| Google の表示名（氏名） | **保存しない**（全員 `Player` に置換） | 不可 | 不可 |
| プロフィール画像 | **保存しない** | 不可 | 不可 |
| IP アドレス・ブラウザの種類 | **保存しない** | 不可 | 不可 |
| Google のトークン（メールアドレスを含む） | **保存しない** | 不可 | 不可 |
| Google のアカウント識別子 | 保存（再ログイン時の本人識別のため） | 可 | 不可 |
| ニックネーム（任意に設定。初期値は `Player-XXXX`） | 保存 | 可 | 可（待機一覧・対局・Ranking） |
| Rating・勝敗数 | 保存 | 可 | 可（待機一覧・Ranking） |
| 対局記録（山札・両者のハンドを含む） | 保存（最終更新から 7 日で削除） | 可 | 自分のハンドと公開済みのカードのみ |
| VS CPU の対局 | **保存しない**（ブラウザ内のみ） | 不可 | 不可 |
| 画面の明るさの設定 | **保存しない**（端末内のみ） | 不可 | 不可 |

外部サービスに送信される情報：

- **Google** — VS Player へのログイン時。
- **Cloudflare**（サイト配信）・**Neon**（サーバー・データベース） — 通信を中継するため、接続情報（IP アドレスなど）が送信される。
- フォントは自サイトから配信しており、ページを開くだけで Google に通信することはない。

### 保証範囲と制約

保証する事項：

- メールアドレス・氏名・画像・IP アドレスを運営者に知られない。
- 自分のハンド・伏せたカード・山札を対戦相手に見られない。
- 他人に自分の席で手を指されない。投了や時間切れを他人に申告されない。
- 他人にニックネームや Rating を書き換えられない。
- 時間切れの申告は、締め切りを過ぎるまでサーバーが受け付けない。

制約：

- **運営者は対局の内容を閲覧できる。** 山札・両者のハンドはサーバーのデータベースに保存される。
- **レート制限を設けていない。** 大量のリクエストへの対策は、Cloudflare と Neon が提供する仕組みに依存する。
- **1 人が複数の Google アカウントで遊ぶことは防げない。** Rating はアカウント単位である。
- **外部サービス（Google・Cloudflare・Neon）における取り扱いは、各社の規約に従う。**
- **第三者による監査は受けていない。** 個人による運営であり、検証は下記の自動検証に限られる。

### 脅威モデルと対策

想定する脅威は、相手のハンドを覗こうとする対戦相手、他人の対局や Rating への干渉を試みるプレイヤー、個人情報を過剰に保持してしまう運営者自身、および一般的な Web 攻撃である。ブラウザは信頼しない。VS Player ではルールの判定と配札をサーバーが行い、ブラウザには各席が閲覧してよい情報だけを送る。ルールはブラウザとサーバーで単一の実装を共有する。

| 対策目標 | 実装 | 根拠 |
|---|---|---|
| 個人情報を保持しない | データベースのトリガーが、書き込みの直前に値を置換する。アプリや認証基盤がどの経路で書き込んでも、置換前の値は保存されない | [20261011000000_auth_scrub.sql](db/migrations/20261011000000_auth_scrub.sql)・[test/db.test.js](test/db.test.js)。本番の残存を検査する [scripts/auth-audit.mjs](scripts/auth-audit.mjs) |
| ハンドと山札の秘匿 | 相手のハンド・伏せたカード・山札・相手専用のログはブラウザに送らない。席ごとに閲覧可能な状態を生成・保存し、本人の分だけを返す | [src/view.js](src/view.js)（`viewFor`）・[test/server.test.js](test/server.test.js)・[20261002000000_init.sql](db/migrations/20261002000000_init.sql)（`game_poll`） |
| テーブルへの直接アクセスの禁止 | テーブルはブラウザから直接読めない（RLS 有効・権限なし）。所定の関数だけが、ログインした本人の分を返す | [20261002000000_init.sql](db/migrations/20261002000000_init.sql)。本番で直接読めないことを検証する [scripts/live-check.mjs](scripts/live-check.mjs) |
| 本人以外による操作の防止 | サーバーがリクエストごとに、トークンの署名・発行者・有効期限と、その対局・席の当事者であることを検証する。トークンはページ表示中のみメモリに保持し、ブラウザのストレージには保存しない。ログインの Cookie は自サイトの中継（`/api/auth`）を経由させ、中継対象は所定のパスに限定する | [server/game/index.js](server/game/index.js)・[server/game/handler.js](server/game/handler.js)・[src/net.js](src/net.js)・[src/authProxy.js](src/authProxy.js) |
| 手番と制限時間の強制 | 1 リクエスト 1 トランザクションで対局をロックし、バージョン・手番・合法手・締め切りを検証してから進行する | [server/game/rules.js](server/game/rules.js)・[server/game/db.js](server/game/db.js)・[scripts/itest.mjs](scripts/itest.mjs) |
| XSS の防止 | ニックネームなどは表示前にエスケープする。加えて、自サイト以外のスクリプトを実行させない | [src/main.js](src/main.js)（`esc`）・[public/_headers](public/_headers) |
| 配札の予測防止 | 山札のシャッフルに暗号論的乱数（`crypto.getRandomValues`）を使う | [src/engine.js](src/engine.js) |
| 秘密情報の管理 | リポジトリには公開の URL だけを置く。データベースの接続文字列は使用時に取得し、表示も保存もしない | [.env.example](.env.example)・[scripts/neon.mjs](scripts/neon.mjs) |

### 自動検証

上部のバッジは、次の検証の結果を示す（安全性を保証するものではない）。

| 検証 | 内容 | 実行タイミング |
|---|---|---|
| [CI](https://github.com/satsuki19980613/GridPoker/actions/workflows/ci.yml) | テスト（相手のハンドの非漏洩、サーバーの受け付け、データベースが個人情報を保持しないことを含む）とビルド | コード変更時 |
| [Live](https://github.com/satsuki19980613/GridPoker/actions/workflows/live.yml) | 本番のサイトとサーバーの疎通、未ログインで読める情報が無いこと、セキュリティヘッダー。Neon の設定がある場合は、本番のデータベースに個人情報が残っていないことと、開発環境での試験ユーザー 2 人による 1 局 | 毎週・サーバー変更時 |
| [CodeQL](https://github.com/satsuki19980613/GridPoker/actions/workflows/codeql.yml) | GitHub CodeQL による静的解析 | コード変更時・毎週 |
| [Secrets](https://github.com/satsuki19980613/GridPoker/actions/workflows/secrets.yml) | gitleaks による秘密情報（API キー・トークン・パスワード・秘密鍵など）の検査。全ブランチの全履歴が対象 | コード変更時・毎週 |
| [Mozilla HTTP Observatory](https://developer.mozilla.org/en-US/observatory/analyze?host=gridpoker.pages.dev) | 公開サイトのセキュリティヘッダー。**A+**（125 点、12 項目すべて合格。2026-10-11 測定）。Live が毎回測定し、A+ 未満なら失敗とする | リンク先で随時再測定できる |

### 脆弱性の報告

[SECURITY.md](SECURITY.md) を参照。リポジトリの Security タブから非公開で報告できる。

### 記載方針

本節は次の指針に基づいて構成している。

- 要点を先に、詳細を後に示す（英国 ICO の[段階的な情報提供](https://ico.org.uk/for-organisations/uk-gdpr-guidance-and-resources/individual-rights/the-right-to-be-informed/what-methods-can-we-use-to-provide-privacy-information/)）
- 取り扱う情報を定型の表で示す（カーネギーメロン大学の[プライバシーの「栄養成分表示」の研究](https://doi.org/10.1145/1753326.1753561)。Apple・Google のアプリストアの表示も同じ考え方）
- 保証範囲と制約、想定する脅威と対策の根拠を示す（[OpenSSF Best Practices](https://www.bestpractices.dev/en/criteria/1)）
- 報告窓口と実施中の検証を示す（[GitHub のリポジトリのベストプラクティス](https://docs.github.com/en/repositories/creating-and-managing-repositories/best-practices-for-repositories)）

## 開発

### 必要環境

- Node.js 22.12 以上

### コマンド

| コマンド | 内容 |
|---|---|
| `npm install` | 依存パッケージのインストール |
| `npm run dev` | 開発サーバー（http://localhost:5173/）。`?fake` でサーバー無しの VS Player を確認できる |
| `npm test` | 単体テスト |
| `npm run build` | 本番ビルド（`dist/`） |

### 関連資料

- 構成・コマンド・規約の詳細：[CLAUDE.md](CLAUDE.md)
