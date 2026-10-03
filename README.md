# Grid Poker

5×5 の盤面で 10 本のライン（行 1〜5・列 a〜e）を同時に戦うポーカー。

- **VS CPU** — ログイン不要
- **VS Player** — Google でログインし、待機中のプレイヤーと対戦
- **Ranking** — VS Player の Rating（Elo）

## ルール（要約）

- 設定は固定: フリーズアウト・初期 Stack 200・初回 Ante 5（全 10 ラインに各 5、盤面ごとに 2 倍）・No Limit・Min raise NL・先手／後手はランダム（以後は盤面ごとに交代）。
- 全ラインに ante。ハンドは常に 4 枚。1 枚を空きマスに伏せて置き、すぐ 1 枚 draw。
- 5 枚目でライン完成。ボードをオープンし、1 ラウンドだけ betting（No Limit。上限は相手が cover できる額までの all-in。fold されたら call されなかった分は戻る）。bet 額は ante を除いた額で示し、Bet は Pot 50%／100%／150%、Raise は相手の bet の ×2／×3／×4、ほかに 5 刻みの任意の額と all-in。
- showdown はハンドから 2 枚＋ボードから 3 枚のベスト 5。
- 25 マスで 1 盤面。stack を持ち越して次の盤面へ（ante は 2 倍）。
- all-in して showdown で負け、手元が 0 になったらその場で負け（未決着の line の pot に残ったチップは勝った側へ）。ante で手元が 0 になっただけなら、自分のチップがある line で負けるまで all-in として続く。ante が足りなければ、持っている分を Line 1 から順に ante 額ずつ置いて all-in（届かなかった line は pot なし）。

## 開発

```bash
npm install
npm run dev
```

構成とコマンドは [CLAUDE.md](CLAUDE.md)。
