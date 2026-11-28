// Pulls the AxisNet-work organisation's repos, languages, READMEs and file
// trees from GitHub into public/data/projects.json so the site can show
// projects without sending visitors to GitHub. Runs as the Vercel build step
// and can be run locally.
//
// Set GITHUB_TOKEN to avoid the 60 requests/hour anonymous limit.
// If anything fails, the existing snapshot is kept and the build continues.

import { readFile, writeFile } from 'node:fs/promises';

const ORG = 'AxisNet-work';

// Repos that shouldn't appear on the site, as "owner/name".
const EXCLUDE = new Set([]);

const OUT = new URL('../public/data/projects.json', import.meta.url);
const API = 'https://api.github.com';

const headers = {
  'User-Agent': 'axisnet.work-site-build',
  'X-GitHub-Api-Version': '2022-11-28',
};
if (process.env.GITHUB_TOKEN) headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;

async function gh(path, accept = 'application/vnd.github+json') {
  const res = await fetch(API + path, { headers: { ...headers, Accept: accept } });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`${res.status} ${res.statusText} on ${path}`);
  return accept.includes('html') ? res.text() : res.json();
}

function isListed(repo) {
  if (repo.fork || repo.archived || repo.private) return false;
  if (repo.name.startsWith('.github')) return false;
  if (repo.name.toLowerCase() === repo.owner.login.toLowerCase()) return false; // profile README repo
  return !EXCLUDE.has(repo.full_name);
}

// GitHub renders README links relative to the repo. Point them at raw files
// (images) or the GitHub blob view (everything else) for the pinned commit.
function rewriteReadme(html, owner, name, sha, readmePath) {
  const dir = readmePath.includes('/') ? readmePath.slice(0, readmePath.lastIndexOf('/') + 1) : '';
  const isRelative = (u) => !/^([a-z][a-z0-9+.-]*:|\/\/|#|data:)/i.test(u);
  const resolve = (u) => (u.startsWith('/') ? u.slice(1) : dir + u.replace(/^\.\//, ''));
  return html
    .replace(/<a [^>]*class="anchor"[^>]*>[\s\S]*?<\/a>/gi, '')
    .replace(/(<img[^>]*?\ssrc=")([^"]+)"/gi, (m, pre, u) =>
      isRelative(u) ? `${pre}https://raw.githubusercontent.com/${owner}/${name}/${sha}/${resolve(u)}"` : m)
    .replace(/(<a[^>]*?\shref=")([^"]+)"/gi, (m, pre, u) =>
      isRelative(u) ? `${pre}https://github.com/${owner}/${name}/blob/${sha}/${resolve(u)}"` : m);
}

async function loadRepo(repo) {
  const owner = repo.owner.login;
  const { name, default_branch: branch } = repo;
  const base = `/repos/${owner}/${name}`;

  const [languages, tree, readmeMeta] = await Promise.all([
    gh(`${base}/languages`),
    gh(`${base}/git/trees/${encodeURIComponent(branch)}?recursive=1`),
    gh(`${base}/readme`),
  ]);

  const sha = tree?.sha ?? branch;
  let readme = null;
  if (readmeMeta) {
    const html = await gh(`${base}/readme`, 'application/vnd.github.html+json');
    readme = { path: readmeMeta.path, html: rewriteReadme(html, owner, name, sha, readmeMeta.path) };
  }

  return {
    owner,
    name,
    description: repo.description,
    homepage: repo.homepage || null,
    url: repo.html_url,
    branch,
    sha,
    license: repo.license?.spdx_id && repo.license.spdx_id !== 'NOASSERTION' ? repo.license.spdx_id : null,
    stars: repo.stargazers_count,
    createdAt: repo.created_at,
    pushedAt: repo.pushed_at,
    languages: languages ?? {},
    readme,
    truncated: Boolean(tree?.truncated),
    tree: (tree?.tree ?? []).map((e) => (e.type === 'blob' ? [e.path, e.size] : [e.path])),
  };
}

async function main() {
  const repos = await gh(`/orgs/${ORG}/repos?per_page=100&type=public&sort=pushed`);
  if (!repos) throw new Error(`organisation ${ORG} not found`);

  const projects = [];
  for (const repo of repos.filter(isListed)) projects.push(await loadRepo(repo));

  projects.sort((a, b) => b.pushedAt.localeCompare(a.pushedAt));
  const data = { generatedAt: new Date().toISOString(), org: ORG, projects };
  await writeFile(OUT, JSON.stringify(data));
  console.log(`sync-projects: wrote ${projects.length} project${projects.length === 1 ? "" : "s"} from ${ORG}`);
}

main().catch(async (err) => {
  const existing = await readFile(OUT, 'utf8').catch(() => null);
  console.warn(`sync-projects: ${err.message}`);
  console.warn(existing ? 'sync-projects: keeping the existing snapshot' : 'sync-projects: no snapshot available');
});
