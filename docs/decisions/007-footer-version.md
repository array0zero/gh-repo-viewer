# package.json をフッターのバージョン表示に利用する

- 状態: 採用（Issue #5）
- 決定: `src/app.ts` で `package.json` の `version` をインポートし、既存の footer 要素に `gh-repo-viewer v{version}` と表示する。TypeScript の `resolveJsonModule` を有効にする。
- 理由: バージョンの二重管理を避け、ビルド時に値を組み込むことで追加通信や依存を必要としない。
- 影響: 既存の CSS をそのまま使い、11px・中央揃え・配置を維持する。取得、検索、フィルタ、並び替え、キャッシュの処理は変更しない。バージョン更新の反映には再ビルドが必要。
