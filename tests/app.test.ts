import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { mountApp } from '../src/app';
import { fetchRepositories, type Repository } from '../src/github';
import { CACHE_KEY, CACHE_TTL, TOKEN_KEY, cacheIdentity, readCache, saveCache } from '../src/storage';

const repo = (overrides: Partial<Repository> = {}): Repository => ({
  id: 1, name: 'alpha', html_url: 'https://github.com/me/alpha', description: '説明',
  language: 'TypeScript', stargazers_count: 2, updated_at: '2026-01-01T12:00:00Z', private: false, ...overrides,
});
const response = (body: unknown = [repo()], status = 200, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers: { 'x-ratelimit-remaining': '59', 'x-ratelimit-reset': '2000000000', ...headers } });
const mockFetch = vi.fn<typeof fetch>();
const element = <T extends HTMLElement = HTMLElement>(id: string) => document.querySelector<T>(`#${id}`)!;
function input(id: string, value: string) {
  element<HTMLInputElement>(id).value = value;
  element(id).dispatchEvent(new Event(id === 'sort' || id === 'language' ? 'change' : 'input', { bubbles: true }));
}
async function submit() {
  element('credentials').dispatchEvent(new Event('submit', { cancelable: true, bubbles: true }));
  await vi.waitFor(() => expect(element<HTMLButtonElement>('fetch').disabled).toBe(false));
}
const names = () => [...document.querySelectorAll('.repo-card h2')].map(node => node.textContent);

beforeEach(() => {
  localStorage.clear();
  mockFetch.mockReset();
  vi.stubGlobal('fetch', mockFetch);
  document.body.innerHTML = '<div id="app"></div>';
  mountApp(element('app'));
  input('username', 'me');
});
afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });

describe('取得とカード表示', () => {
  it('公開 API を認証なしで呼び、全項目と残回数を表示する', async () => {
    mockFetch.mockImplementation(async () => response());
    await submit();
    const [url, options] = mockFetch.mock.calls[0];
    expect(String(url)).toContain('/users/me/repos?');
    expect(String(url)).toContain('per_page=100');
    expect(options?.headers).not.toHaveProperty('Authorization');
    expect(names()).toEqual(['alpha']);
    expect(element('repositories').textContent).toContain('説明');
    for (const value of ['TypeScript', '☆ 2', '更新 2026-01-01', '公開']) expect(element('repositories').textContent).toContain(value);
    expect(document.querySelector('h2 a')?.getAttribute('href')).toBe('https://github.com/me/alpha');
    expect(element('rate').textContent).toBe('API 残り回数: 59');
  });
  it('認証 API にトークンと owner 制約を送り、非公開を表示しトークンを復元する', async () => {
    input('token', 'example-token');
    expect(localStorage.getItem(TOKEN_KEY)).toBe('example-token');
    mountApp(element('app'));
    expect(element<HTMLInputElement>('token').value).toBe('example-token');
    input('username', 'me');
    mockFetch.mockResolvedValue(response([repo({ private: true })]));
    await submit();
    expect(String(mockFetch.mock.calls[0][0])).toContain('/user/repos?');
    expect(String(mockFetch.mock.calls[0][0])).toContain('affiliation=owner');
    expect(mockFetch.mock.calls[0][1]?.headers).toHaveProperty('Authorization', 'Bearer example-token');
    expect(element('repositories').textContent).toContain('非公開');
    input('token', '');
    expect(localStorage.getItem(TOKEN_KEY)).toBeNull();
  });
  it('0 件と null の説明・言語を扱う', async () => {
    mockFetch.mockResolvedValueOnce(response([]));
    await submit();
    expect(element('status').textContent).toContain('0 件');
    element('clear-cache').click();
    mockFetch.mockResolvedValueOnce(response([repo({ description: null, language: null })]));
    await submit();
    expect(document.querySelector('.description')?.textContent).toBe('');
    expect(element('repositories').textContent).toContain('未設定');
  });
  it('名前と説明を HTML として実行しない', async () => {
    mockFetch.mockResolvedValue(response([repo({ name: '<img src=x onerror=alert(1)>', description: '<script>bad()</script>' })]));
    await submit();
    expect(element('repositories').querySelector('img, script')).toBeNull();
    expect(names()).toEqual(['<img src=x onerror=alert(1)>']);
  });
});

describe('検索・言語・並び替え', () => {
  beforeEach(async () => {
    mockFetch.mockResolvedValue(response([
      repo(), repo({ id: 2, name: 'zeta', language: 'Rust', stargazers_count: 10, updated_at: '2026-02-01T00:00:00Z' }),
      repo({ id: 3, name: 'beta', language: 'TypeScript', stargazers_count: 4, updated_at: '2026-03-01T00:00:00Z' }),
    ]));
    await submit();
  });
  it('更新日降順・スター降順・名前昇順を切り替える', () => {
    expect(names()).toEqual(['beta', 'zeta', 'alpha']);
    input('sort', 'stars'); expect(names()).toEqual(['zeta', 'beta', 'alpha']);
    input('sort', 'name'); expect(names()).toEqual(['alpha', 'beta', 'zeta']);
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });
  it('部分一致と選択言語を組み合わせ、該当なしを表示する', () => {
    input('search', 'TA'); expect(names()).toEqual(['beta', 'zeta']);
    input('language', 'TypeScript'); expect(names()).toEqual(['beta']);
    input('search', 'missing'); expect(names()).toEqual([]);
    expect(element('status').textContent).toContain('一致するリポジトリはありません');
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });
});

describe('永続キャッシュ', () => {
  it('再読み込み後も10分未満なら通信せず、ちょうど10分で再取得する', async () => {
    const now = Date.now();
    vi.spyOn(Date, 'now').mockReturnValue(now);
    mockFetch.mockImplementation(async () => response());
    await submit();
    expect(JSON.parse(localStorage.getItem(CACHE_KEY)!).data.repositories).toHaveLength(1);
    mountApp(element('app')); input('username', 'me');
    vi.spyOn(Date, 'now').mockReturnValue(now + CACHE_TTL - 1);
    await submit();
    expect(mockFetch).toHaveBeenCalledTimes(1);
    expect(names()).toEqual(['alpha']);
    expect(element('status').textContent).toContain('キャッシュ');
    expect(element('rate').textContent).toContain('取得時点');
    vi.spyOn(Date, 'now').mockReturnValue(now + CACHE_TTL);
    await submit();
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });
  it('手動破棄は即通信せず、次回取得で通信する', async () => {
    mockFetch.mockImplementation(async () => response());
    await submit(); element('clear-cache').click();
    expect(localStorage.getItem(CACHE_KEY)).toBeNull();
    expect(mockFetch).toHaveBeenCalledTimes(1);
    await submit(); expect(mockFetch).toHaveBeenCalledTimes(2);
  });
  it('ユーザー名、トークン、認証有無が変わったら使い回さない', async () => {
    mockFetch.mockImplementation(async () => response());
    await submit();
    input('username', 'other'); await submit();
    input('token', 'first-token'); await submit();
    expect(localStorage.getItem(CACHE_KEY)).not.toContain('first-token');
    input('token', 'second-token'); await submit();
    input('token', ''); await submit();
    expect(mockFetch).toHaveBeenCalledTimes(5);
  });
  it('破損キャッシュを無視する', async () => {
    localStorage.setItem(CACHE_KEY, '{broken');
    mockFetch.mockImplementation(async () => response());
    await submit(); expect(names()).toEqual(['alpha']);
    const identity = await cacheIdentity('me', '');
    saveCache(identity, { repositories: [repo()], remaining: 10, reset: null, truncated: false });
    const entry = JSON.parse(localStorage.getItem(CACHE_KEY)!);
    entry.data.repositories[0].html_url = 'javascript:alert(1)';
    localStorage.setItem(CACHE_KEY, JSON.stringify(entry));
    expect(readCache(identity)).toBeNull();
  });
  it('保存が拒否されても取得結果と操作を残す', async () => {
    vi.stubGlobal('localStorage', {
      getItem: () => null,
      removeItem: () => {},
      setItem: () => { throw new Error('quota'); },
    });
    mockFetch.mockImplementation(async () => response());
    await submit();
    expect(names()).toEqual(['alpha']);
    expect(element('warning').textContent).toContain('保存できません');
    expect(element<HTMLButtonElement>('fetch').disabled).toBe(false);
  });
});

describe('失敗後も操作可能', () => {
  it.each([
    [401, {}, 'トークンが無効'],
    [404, {}, 'ユーザーが存在しません'],
    [403, { 'x-ratelimit-remaining': '0' }, 'リセット時刻:'],
    [429, { 'x-ratelimit-remaining': '0' }, 'リセット時刻:'],
    [403, {}, 'アクセスが拒否'],
    [500, {}, 'GitHub API エラー'],
  ])('%s のエラーを表示して再取得できる', async (code, headers, message) => {
    mockFetch.mockResolvedValueOnce(response({}, code, headers));
    await submit();
    expect(element('error').textContent).toContain(message);
    if (code === 429 || (code === 403 && headers['x-ratelimit-remaining'] === '0')) {
      expect(element('error').textContent).toContain(new Date(2000000000 * 1000).toLocaleString('ja-JP'));
      expect(element('rate').textContent).toContain('0');
    }
    expect(localStorage.getItem(CACHE_KEY)).toBeNull();
    for (const id of ['fetch', 'clear-cache', 'username', 'token']) expect(element<HTMLInputElement>(id).disabled).toBe(false);
    mockFetch.mockResolvedValueOnce(response()); await submit();
    expect(names()).toEqual(['alpha']); expect(element('error').textContent).toBe('');
  });
  it('ネットワーク障害を処理し再試行できる', async () => {
    mockFetch.mockRejectedValueOnce(new TypeError('Failed to fetch'));
    await submit(); expect(element('error').textContent).toContain('通信エラー');
    mockFetch.mockResolvedValueOnce(response()); await submit(); expect(names()).toEqual(['alpha']);
  });
  it('不正な JSON を処理する', async () => {
    mockFetch.mockResolvedValueOnce(new Response('bad json'));
    await submit(); expect(element('error').textContent).toContain('応答を読み取れません');
  });
  it('取得中の多重送信を防ぐ', async () => {
    let resolve!: (value: Response) => void;
    mockFetch.mockImplementationOnce(() => new Promise(done => { resolve = done; }));
    const first = submit();
    await vi.waitFor(() => expect(mockFetch).toHaveBeenCalledTimes(1));
    element('credentials').dispatchEvent(new Event('submit', { cancelable: true }));
    expect(mockFetch).toHaveBeenCalledTimes(1);
    resolve(response()); await first;
  });
});

describe('ページネーション', () => {
  const next = { link: '<https://api.github.com/user/repos?page=2>; rel="next"' };
  it('100 件より多い場合は次ページもカード表示する', async () => {
    mockFetch.mockResolvedValueOnce(response(Array.from({ length: 100 }, (_, id) => repo({ id, name: `repo-${id}` })), 200, next));
    mockFetch.mockResolvedValueOnce(response([repo({ id: 100, name: 'last' })], 200, { 'x-ratelimit-remaining': '58' }));
    await submit();
    expect(names()).toHaveLength(101);
    expect(names()).toContain('last');
    expect(String(mockFetch.mock.calls[1][0])).toContain('page=2');
    expect(element('rate').textContent).toBe('API 残り回数: 58');
  });
  it('最大3ページで打ち切り、取得上限を知らせる', async () => {
    for (let page = 0; page < 3; page++) mockFetch.mockResolvedValueOnce(response(Array.from({ length: 100 }, (_, id) => repo({ id: page * 100 + id })), 200, next));
    await submit();
    expect(mockFetch).toHaveBeenCalledTimes(3);
    expect(String(mockFetch.mock.calls[2][0])).toContain('page=3');
    expect(names()).toHaveLength(300);
    expect(element('status').textContent).toContain('最大 300 件');
  });
  it('後続ページの失敗時に部分データをキャッシュしない', async () => {
    mockFetch.mockResolvedValueOnce(response([repo()], 200, next));
    mockFetch.mockResolvedValueOnce(response({}, 403, { 'x-ratelimit-remaining': '0' }));
    await submit();
    expect(element('error').textContent).toContain('レート制限');
    expect(names()).toEqual([]);
    expect(localStorage.getItem(CACHE_KEY)).toBeNull();
  });
  it('Link の外部 URL を追わず、API ホスト内でページ番号を増やす', async () => {
    mockFetch.mockResolvedValueOnce(response([repo()], 200, { link: '<https://evil.example/>; rel="next"' }));
    mockFetch.mockResolvedValueOnce(response([]));
    await fetchRepositories('me', 'test-token');
    expect(String(mockFetch.mock.calls[1][0])).toMatch(/^https:\/\/api.github.com\/user\/repos\?/);
  });
});

