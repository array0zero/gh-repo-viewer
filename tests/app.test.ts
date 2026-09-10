import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { mountApp } from '../src/app';
import { fetchRepositories, type Repository } from '../src/github';
import { CACHE_KEY, CACHE_TTL, cacheIdentity, readCache, saveCache } from '../src/storage';

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
    expect(new URL(String(url)).searchParams.get('type')).toBe('owner');
    expect(new URL(String(url)).searchParams.has('affiliation')).toBe(false);
    expect(options?.headers).not.toHaveProperty('Authorization');
    expect(names()).toEqual(['alpha']);
    expect(element('repositories').textContent).toContain('説明');
    for (const value of ['TypeScript', '☆ 2', '更新 2026-01-01', '公開']) expect(element('repositories').textContent).toContain(value);
    expect(document.querySelector('h2 a')?.getAttribute('href')).toBe('https://github.com/me/alpha');
    expect(element('rate').textContent).toBe('API 残り回数: 59');
  });
  it('初期ユーザー名は空で、入力欄と保存処理に認証情報を持たない', async () => {
    const storage = localStorage;
    const getItem = vi.fn((key: string) => storage.getItem(key));
    const setItem = vi.fn((key: string, value: string) => storage.setItem(key, value));
    vi.stubGlobal('localStorage', { getItem, setItem, removeItem: (key: string) => storage.removeItem(key) });
    mountApp(element('app'));
    expect(element<HTMLInputElement>('username').value).toBe('');
    expect(document.querySelector('#token, input[type="password"]')).toBeNull();
    expect(element('app').textContent).not.toContain('トークン');
    expect(getItem).not.toHaveBeenCalled();
    input('username', 'me');
    mockFetch.mockResolvedValue(response());
    await submit();
    expect(setItem.mock.calls.map(([key]) => key)).toEqual([CACHE_KEY]);
  });
  it.each(['', '   '])('ユーザー名が空ならメッセージを表示し通信しない (%s)', async value => {
    input('username', value);
    if (value === '') element<HTMLFormElement>('credentials').requestSubmit();
    else await submit();
    expect(element('error').textContent).toContain('ユーザー名を入力してください');
    expect(mockFetch).not.toHaveBeenCalled();
    expect(element<HTMLButtonElement>('fetch').disabled).toBe(false);
    mockFetch.mockResolvedValue(response());
    input('username', 'me');
    await submit();
    expect(names()).toEqual(['alpha']);
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
  it('異なるユーザー名では前回の結果を使い回さない', async () => {
    mockFetch.mockResolvedValueOnce(response());
    mockFetch.mockResolvedValueOnce(response([repo({ id: 2, name: 'other-repo' })]));
    await submit();
    input('username', 'other'); await submit();
    expect(mockFetch).toHaveBeenCalledTimes(2);
    expect(names()).toEqual(['other-repo']);
    expect(String(mockFetch.mock.calls[1][0])).toContain('/users/other/repos?');
  });
  it('ユーザー名の大文字小文字と前後の空白は同じキャッシュを使う', async () => {
    mockFetch.mockResolvedValue(response());
    await submit();
    input('username', ' ME '); await submit();
    expect(mockFetch).toHaveBeenCalledTimes(1);
    expect(cacheIdentity(' ME ')).toBe('me');
  });
  it('v1 形式のキャッシュを再利用しない', async () => {
    localStorage.setItem('gh-repo-viewer:cache:v1', JSON.stringify({
      identity: cacheIdentity('me'), savedAt: Date.now(),
      data: { repositories: [repo({ name: 'old-result' })], remaining: 10, reset: null, truncated: false },
    }));
    mockFetch.mockResolvedValue(response());
    await submit();
    expect(mockFetch).toHaveBeenCalledTimes(1);
    expect(names()).toEqual(['alpha']);
  });
  it('破損キャッシュを無視する', async () => {
    localStorage.setItem(CACHE_KEY, '{broken');
    mockFetch.mockImplementation(async () => response());
    await submit(); expect(names()).toEqual(['alpha']);
    const identity = cacheIdentity('me');
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
    for (const id of ['fetch', 'clear-cache', 'username']) expect(element<HTMLInputElement>(id).disabled).toBe(false);
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
  const next = { link: '<https://api.github.com/users/me/repos?page=2>; rel="next"' };
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
    await fetchRepositories('me');
    expect(String(mockFetch.mock.calls[1][0])).toMatch(/^https:\/\/api.github.com\/users\/me\/repos\?/);
  });
});

