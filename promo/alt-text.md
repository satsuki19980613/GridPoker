# X 投稿用 Alt テキスト

横長（x-*.png、1600×900）と縦長（v-*.png、900×1200）は同じ内容なので、Alt テキストも共通。

## 1枚目　x-1-concept.png ／ v-1-concept.png

```
Grid Poker のコンセプト図。5×5の盤面で、行と列の10本のlineがすべてpot。置いた1枚は行と列の2本のboardに入る。流れは PLACE（1枚伏せて1枚引く）→ COMPLETE（5枚そろったらopen）→ BET（1 street、No Limit）→ SHOWDOWN（hole 2 + board 3）。stackが尽きるまで盤面を重ねるフリーズアウトで、初期stack 200、anteは5から盤面ごとに2倍。
```

## 2枚目　x-2-play.png ／ v-2-play.png

```
プレイ画面2枚。左はカードを置くマスを選ぶ場面。右はLine bが完成し、CPUのbet 10に対してFold・Call・Raiseを選ぶ場面。
```

## 3枚目　x-3-showdown.png ／ v-3-showdown.png

```
raise画面とshowdown画面。左はall-in 155を選んだraise画面。右はLine bのshowdownで、One Pair 99に対しCPUがTwo Pair QQ88で勝った結果。
```

## 4枚目　x-4-result.png ／ v-4-result.png

```
盤面の切り替わりと終局の画面。左は盤面1の終了画面で、YOU 142、CPU 258、次の盤面はante 10。右は終局画面。盤面ごとにanteが5・10・20・40と倍になり、盤面4でYOUのチップが尽きてCPUが400で勝利。
```

---

# 白ベース版（w-*.png、縦長 900×1200、2026-10-03。ante の後払い・新しい Bet／Raise の後）

## 1枚目　w-1-concept.png

```
Grid Poker のコンセプト図（白背景）。5×5の盤面で、行と列の10本のlineで勝負する。置いた1枚は行と列の2本のlineに入る。図ではLine 1が完成し、両者がante 5ずつ払っている。流れは PLACE（1枚伏せて1枚引く）→ COMPLETE（5枚そろったらopenしてanteを払う）→ BET（1 street、No Limit）→ SHOWDOWN（hole 2 + board 3）。フリーズアウト、初期stack 200、anteは5で盤面ごとに2倍。
```

## 2枚目　w-2-play.png

```
プレイ画面2枚（白背景）。左はカードを置くマスを選ぶ場面で、どのpotもまだ空。右はLine 1が完成し、両者がante 5を払ってpot 10になり、CheckかBetを選ぶ場面。
```

## 3枚目　w-3-bet.png

```
betとraiseの画面2枚（白背景）。左はpot 10に対するbetで、Pot 50%・100%・150%（5・10・15）とAll-inから選べる。右は相手のbet 5に対するraiseで、×2・×3・×4（10・15・20）とAll-inから選べる。
```

## 4枚目　w-4-result.png

```
showdownと終局の画面（白背景）。左はLine 1のshowdownで、One Pair QQがOne Pair 33に勝ってpot 20を取った結果。右は終局画面。anteは盤面ごとに5・10・20・40と倍になり、盤面4でYOUのstackが尽きてCPUが400で勝利。
```
