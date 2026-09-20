import { version } from '../package.json';
import { fetchRepositories, GitHubError, type Repository } from './github';
import { cacheIdentity, clearCache, readCache, saveCache } from './storage';

export function mountApp(root: HTMLElement): void {
  root.innerHTML = `
    <main>
      <header><span class="eyebrow">YOUR GITHUB, AT A GLANCE</span><h1>Repo Viewer<span class="dot">.</span></h1>
      <p>公開リポジトリを、すばやく見つける。</p></header>
      <section class="panel" aria-label="取得設定">
        <form id="credentials">
          <label>GitHub ユーザー名<input id="username" name="username" placeholder="octocat" autocomplete="username" pattern="[a-zA-Z0-9][a-zA-Z0-9-]{0,38}" /></label>
          <button id="fetch" type="submit">リポジトリを取得</button>
        </form>
        <div class="cache-row"><span>キャッシュ有効期間: 10 分</span><button id="clear-cache" class="secondary" type="button">キャッシュを破棄</button></div>
      </section>
      <div class="toolbar">
        <label class="search">名前で検索<input id="search" type="search" placeholder="リポジトリ名を入力…" /></label>
        <label>言語<select id="language"><option value="">すべての言語</option></select></label>
        <label>並び替え<select id="sort"><option value="updated">更新日順</option><option value="stars">スター数順</option><option value="name">名前順</option></select></label>
      </div>
      <div class="summary"><strong id="count">0 件</strong><span id="rate">API 残り回数: —</span></div>
      <p id="status" role="status" aria-live="polite">ユーザー名を入力してリポジトリを取得してください。</p>
      <p id="warning" role="status" class="hint"></p>
      <p id="error" role="alert"></p>
      <section id="repositories" class="grid" aria-label="リポジトリ一覧" aria-busy="false"></section>
      <footer>gh-repo-viewer v${version}</footer>
    </main>`;
  const get = <T extends HTMLElement>(id: string) => root.querySelector<T>(`#${id}`)!;
  const username = get<HTMLInputElement>('username');
  const search = get<HTMLInputElement>('search');
  const language = get<HTMLSelectElement>('language');
  const sort = get<HTMLSelectElement>('sort');
  const list = get<HTMLElement>('repositories');
  const status = get<HTMLElement>('status');
  const error = get<HTMLElement>('error');
  const warning = get<HTMLElement>('warning');
  const rate = get<HTMLElement>('rate');
  const submit = get<HTMLButtonElement>('fetch');
  const clear = get<HTMLButtonElement>('clear-cache');
  let repositories: Repository[] = [];
  let loaded = false;
  let busy = false;
  let source = '';
  let bypassCache = false;

  function render(): void {
    const query = search.value.trim().toLowerCase();
    const visible = repositories.filter(repo => repo.name.toLowerCase().includes(query) && (!language.value || (repo.language ?? '未設定') === language.value));
    visible.sort((a, b) => sort.value === 'stars' ? b.stargazers_count - a.stargazers_count || a.name.localeCompare(b.name)
      : sort.value === 'name' ? a.name.localeCompare(b.name) : Date.parse(b.updated_at) - Date.parse(a.updated_at) || a.name.localeCompare(b.name));
    list.replaceChildren();
    for (const repo of visible) {
      const card = document.createElement('article');
      card.className = 'repo-card';
      const top = document.createElement('div');
      top.className = 'card-top';
      const title = document.createElement('h2');
      const link = document.createElement('a');
      link.href = repo.html_url; link.textContent = repo.name; link.target = '_blank'; link.rel = 'noopener noreferrer';
      title.append(link);
      const badge = document.createElement('span');
      badge.className = 'badge'; badge.textContent = repo.private ? '非公開' : '公開';
      top.append(title, badge);
      const description = document.createElement('p');
      description.className = 'description'; description.textContent = repo.description ?? '';
      const metadata = document.createElement('div');
      metadata.className = 'metadata';
      for (const text of [repo.language ?? '未設定', `☆ ${repo.stargazers_count}`, `更新 ${repo.updated_at.slice(0, 10)}`]) {
        const span = document.createElement('span'); span.textContent = text; metadata.append(span);
      }
      card.append(top, description, metadata); list.append(card);
    }
    get('count').textContent = `${visible.length} / ${repositories.length} 件`;
    if (loaded) status.textContent = repositories.length === 0 ? 'リポジトリは 0 件です。' : visible.length === 0 ? '条件に一致するリポジトリはありません。' : source;
  }

  search.addEventListener('input', render);
  language.addEventListener('change', render);
  sort.addEventListener('change', render);
  clear.addEventListener('click', () => {
    bypassCache = true;
    const cleared = clearCache();
    status.textContent = cleared ? 'キャッシュを破棄しました。次回の取得で再通信します。' : 'キャッシュを削除できませんでした。この画面での次回取得は再通信します。';
  });
  get<HTMLFormElement>('credentials').addEventListener('submit', async event => {
    event.preventDefault();
    if (busy) return;
    const user = username.value.trim();
    if (!user) { error.textContent = 'GitHub ユーザー名を入力してください。'; return; }
    busy = true;
    submit.disabled = clear.disabled = username.disabled = true;
    submit.textContent = '取得中…';
    list.setAttribute('aria-busy', 'true');
    error.textContent = ''; warning.textContent = '';
    loaded = false; repositories = []; render();
    status.textContent = 'リポジトリを取得しています…';
    rate.textContent = 'API 残り回数: —';
    try {
      const identity = cacheIdentity(user);
      const cached = bypassCache ? null : readCache(identity);
      const data = cached ?? await fetchRepositories(user);
      if (!cached && !saveCache(identity, data)) warning.textContent += ' 取得結果を保存できませんでした。';
      bypassCache = false;
      repositories = data.repositories;
      source = `${cached ? 'キャッシュから表示' : 'GitHub から取得'}${data.truncated ? ' · 最大 300 件に達したため、続きは取得していません。' : ''}`;
      rate.textContent = `API 残り回数: ${data.remaining ?? '—'}${cached ? '（取得時点）' : ''}`;
      const previousLanguage = language.value;
      const option = (label: string, value: string) => {
        const node = document.createElement('option');
        node.textContent = label; node.value = value;
        return node;
      };
      language.replaceChildren(option('すべての言語', ''));
      [...new Set(repositories.map(repo => repo.language ?? '未設定'))].sort().forEach(value => language.add(option(value, value)));
      language.value = [...language.options].some(option => option.value === previousLanguage) ? previousLanguage : '';
      loaded = true; render();
    } catch (cause) {
      error.textContent = cause instanceof GitHubError ? cause.message : '取得に失敗しました。時間をおいて再度お試しください。';
      if (cause instanceof GitHubError) rate.textContent = `API 残り回数: ${cause.remaining ?? '—'}`;
      status.textContent = '入力を確認して再取得できます。';
    } finally {
      busy = false;
      submit.disabled = clear.disabled = username.disabled = false;
      submit.textContent = 'リポジトリを取得';
      list.setAttribute('aria-busy', 'false');
    }
  });
}
