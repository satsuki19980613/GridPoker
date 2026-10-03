# Grid Poker

5×5 の盤面の 10 本のライン（行 1〜5・列 a〜e）で勝負するポーカー。

- **VS CPU** — ログイン不要
- **VS Player** — Google でログインし、待機中のプレイヤーと対戦
- **Ranking** — VS Player の Rating（Elo）

## ルール（要約）

- 設定は固定: フリーズアウト・初期 Stack 200・初回 Ante 5（ラインごとに完成時に後払い、盤面ごとに 2 倍）・No Limit・Min raise NL・先手／後手はランダム（以後は盤面ごとに交代）。
- ハンドは常に 4 枚。1 枚を空きマスに伏せて置き、すぐ 1 枚 draw。
- 5 枚目でライン完成。ボードをオープンし、両者がそのラインの ante を払ってから 1 ラウンドだけ betting（No Limit。上限は相手が cover できる額までの all-in。fold されたら call されなかった分は戻る）。bet 額は ante を除いた額で示し、Bet は Pot 50%／100%／150%、Raise は相手の bet の ×2／×3／×4、ほかに 5 刻みの任意の額と all-in。
- showdown はハンドから 2 枚＋ボードから 3 枚のベスト 5。
- 25 マスで 1 盤面。stack を持ち越して次の盤面へ（ante は 2 倍）。
- line が決着した時点で手元が 0 なら、その場で負け。ante が足りなければ、持っている分だけ払って all-in（相手も同額）。

## 開発

```bash
npm install
npm run dev
```

構成とコマンドは [CLAUDE.md](CLAUDE.md)。
