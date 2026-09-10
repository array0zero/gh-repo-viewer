# 自分が所有するリポジトリを最大300件取得する

- 状態: 採用
- 決定: 認証ありは `/user/repos?affiliation=owner`、認証なしは `/users/{username}/repos?type=owner` を使う。更新日降順、1ページ100件で Link ヘッダーに次ページがある場合に続行し、3ページを上限とする。
- 理由: 自分のリポジトリのみという範囲と、仕様の最大3ページを守るため。
- 影響: 認証ありはトークン所有者が対象となることを画面に明記する。API の返す外部 URL を直接追わず、固定の GitHub API ホスト内でページ番号を増やす。上限を超えた分は並び替え・検索の対象外とし、画面で知らせる。
- 参照: [GitHub REST API repositories](https://docs.github.com/en/rest/repos/repos#list-repositories-for-the-authenticated-user)
