# Vite + TypeScript と素の DOM を使用する

- 状態: 採用
- 決定: 仕様どおり、Vite でビルドする TypeScript の単一画面アプリとする。実行時依存は追加せず fetch とブラウザ API を利用する。
- 理由: 一覧表示とクライアント内の絞り込みで完結し、フレームワークやサーバーが不要なため。
- 検証: Vitest + happy-dom で実際の DOM イベントを発火し、fetch はすべてモック化する。実ブラウザと実 GitHub API はテストで使用しない。
