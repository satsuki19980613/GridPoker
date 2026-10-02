# Grid Poker

5×5 の盤面で 10 本のライン（行 1〜5・列 a〜e）を同時に戦うポーカー。

- **VS CPU** — ログイン不要
- **VS Player** — Google でログインし、待機中のプレイヤーと対戦
- **Ranking** — VS Player の Rating（Elo）

## ルール（要約）

- 設定は固定: Stack 200・Ante 5（全 10 ラインに各 5）・Min raise NL・先手／後手はランダム。
- 全ラインに ante。ハンドは常に 4 枚。1 枚を空きマスに伏せて置き、すぐ 1 枚 draw。
- 5 枚目でライン完成。ボードをオープンし、1 ラウンドだけ betting（Pot Limit）。
- showdown はハンドから 2 枚＋ボードから 3 枚のベスト 5。
- 25 マスで終了。stack の多い方の勝ち。
- 途中で stack が 0 になったら、そのラインの決着（showdown）時点で終了し、0 になった側の負け。

## 開発

```bash
npm install
npm run dev
```

構成とコマンドは [CLAUDE.md](CLAUDE.md)。
