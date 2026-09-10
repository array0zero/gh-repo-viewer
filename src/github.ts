export interface Repository {
  id: number;
  name: string;
  html_url: string;
  description: string | null;
  language: string | null;
  stargazers_count: number;
  updated_at: string;
  private: boolean;
}

export interface RepoResult {
  repositories: Repository[];
  remaining: number | null;
  reset: number | null;
  truncated: boolean;
}

export class GitHubError extends Error {
  constructor(message: string, public remaining: number | null = null, public reset: number | null = null) {
    super(message);
  }
}

function numberHeader(headers: Headers, name: string): number | null {
  const value = headers.get(name);
  return value !== null && value.trim() !== '' && Number.isFinite(Number(value)) ? Number(value) : null;
}

export function isRepository(value: unknown): value is Repository {
  if (!value || typeof value !== 'object') return false;
  const repo = value as Repository;
  return Number.isFinite(repo.id) && typeof repo.name === 'string'
    && typeof repo.html_url === 'string' && /^https:\/\/github\.com\//.test(repo.html_url)
    && (repo.description === null || typeof repo.description === 'string')
    && (repo.language === null || typeof repo.language === 'string')
    && Number.isFinite(repo.stargazers_count) && typeof repo.private === 'boolean'
    && typeof repo.updated_at === 'string' && Number.isFinite(Date.parse(repo.updated_at));
}

export async function fetchRepositories(username: string): Promise<RepoResult> {
  const result: RepoResult = { repositories: [], remaining: null, reset: null, truncated: false };
  const headers: Record<string, string> = { Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28' };
  for (let page = 1; page <= 3; page++) {
    const url = new URL(`https://api.github.com/users/${encodeURIComponent(username)}/repos`);
    url.search = new URLSearchParams({ per_page: '100', page: String(page), sort: 'updated', direction: 'desc', type: 'owner' }).toString();
    let response: Response;
    try {
      response = await fetch(url.toString(), { headers, signal: AbortSignal.timeout(30_000) });
    } catch {
      throw new GitHubError('通信エラーが発生しました。接続を確認して再度取得してください。', result.remaining, result.reset);
    }
    result.remaining = numberHeader(response.headers, 'x-ratelimit-remaining');
    result.reset = numberHeader(response.headers, 'x-ratelimit-reset');
    if (!response.ok) {
      let message = `GitHub API エラー（${response.status}）。時間をおいて再度取得してください。`;
      if (response.status === 404) message = 'ユーザーが存在しません。ユーザー名を確認してください。';
      else if (response.status === 429 || (response.status === 403 && result.remaining === 0)) {
        const reset = result.reset === null ? '不明（時間をおいて再試行してください）' : new Date(result.reset * 1000).toLocaleString('ja-JP');
        message = `API のレート制限を超過しました。リセット時刻: ${reset}`;
      } else if (response.status === 403) message = 'アクセスが拒否されました。時間をおいて再度取得してください。';
      throw new GitHubError(message, result.remaining, result.reset);
    }
    let data: unknown;
    try { data = await response.json(); } catch { throw new GitHubError('GitHub API の応答を読み取れませんでした。', result.remaining, result.reset); }
    if (!Array.isArray(data) || !data.every(isRepository)) throw new GitHubError('GitHub API の応答形式が不正です。', result.remaining, result.reset);
    result.repositories.push(...data);
    const next = /<[^>]+>;\s*rel="next"/.test(response.headers.get('link') ?? '');
    if (!next) break;
    if (page === 3) result.truncated = true;
  }
  result.repositories = [...new Map(result.repositories.map(repo => [repo.id, repo])).values()];
  return result;
}
