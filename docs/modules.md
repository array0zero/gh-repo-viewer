# v2 のファイル構成と公開インターフェース

| ファイル | 役割・公開関数等 |
| --- | --- |
| `src/main.ts` | CSS を読み込み、アプリを起動する。公開関数なし。 |
| `src/app.ts` | `mountApp(root: HTMLElement): void`。フォーム、画面状態、キャッシュと通信の連携、エラー表示、検索・フィルタ・並び替え、カード描画、`package.json` の `version` を読み込んだ `gh-repo-viewer v{version}` のフッター表示を担当する。 |
| `src/github.ts` | `fetchRepositories(username: string): Promise<RepoResult>` が公開リポジトリを最大3ページ取得する。`isRepository(value: unknown): value is Repository` が API とキャッシュのデータを検証する。公開型 `Repository` はカード項目、`RepoResult` は一覧・残回数・リセット時刻・上限到達フラグを保持する。`GitHubError` はメッセージと残回数・リセット時刻を保持する公開エラークラス。 |
| `src/storage.ts` | `cacheIdentity(username: string): string` がユーザー名を trim・小文字化する。`readCache(identity: string, now = Date.now()): RepoResult | null` が有効なキャッシュを返す。`saveCache(identity: string, data: RepoResult): boolean` が保存、`clearCache(): boolean` が削除の成否を返す。公開定数は `CACHE_KEY`（`gh-repo-viewer:cache:v2`）、`CACHE_TTL`（600000ミリ秒）。最新の成功結果1件のみ保持する。 |
| `src/style.css` | ダーク配色の共通変数、余白・境界・文字の階層、カード下端のメタデータ配置、44px以上の操作要素とフォーカス表示、720px以下の1列表示、長文の折り返し、フッターの11px・中央揃え。公開関数なし。 |
| `index.html` | アプリのマウント先とエントリーポイント。 |
| `tests/app.test.ts` | Vitest + happy-dom とモック fetch で取得、空欄、キャッシュ、表示操作、障害復帰、ページネーションを検証する。フッターの全文が `package.json` の `version` を使った表示と一致することも検証する。公開関数なし。 |
| `vite.config.ts` | Vitest の DOM 環境とモック復元を設定する。 |
| `tsconfig.json` | TypeScript の型検査と JSON モジュール読み込みの設定。 |
| `package.json` | アプリのバージョン（フッター表示の参照元）、開発、ビルド、プレビュー、テストのコマンドと開発依存。 |

仕様は `docs/specs/`、設計判断は `docs/decisions/`、処理順序は `docs/walkthrough.md`、未解決点は `docs/questions.md` に記録する。
