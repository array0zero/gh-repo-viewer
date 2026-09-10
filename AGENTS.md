# gh-repo-viewer

## このリポジトリについて

GitHub API から自分のリポジトリを取得し、検索・言語フィルタ・並び替えを行うブラウザアプリ。
Vite + TypeScript を使用し、取得結果をブラウザに10分間キャッシュする。

## 作業の前に読むもの

- docs/specs/ の該当ファイル
- docs/decisions/ の関連する決定記録

## ルール

- 仕様を変更したら、コードと同じ PR で docs/specs/ も更新する
- 設計判断は docs/decisions/ に 1 ファイル 1 決定で記録する
- 実装後、docs/walkthrough.md に処理の流れを順序立てて記録する
- 実装後、docs/modules.md に各ファイルの役割と公開関数を記録する
- 不明点は推測で実装せず docs/questions.md に追記して次へ進む
- 外部サービスの操作は MCP ではなく CLI を優先する

## 検証

- ビルド: `npm run build`
- テスト: `npm test`（Vitest + happy-dom、通信はモック）
- 完了条件: 上記 2 つが通り、docs/specs/ の受入条件を満たすこと
