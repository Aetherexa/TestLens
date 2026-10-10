import { randomBytes } from 'node:crypto';
import type * as vscode from 'vscode';
import type { Finding, SuggestedTest } from '../../core/src/index.js';

export interface ReportData {
  workspace: string;
  framework: string;
  changes: number;
  findings: Finding[];
  tests: SuggestedTest[];
  coverageSource: string;
  status: string;
}
const safe = (value: string): string => value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
const payload = (v: unknown): string => JSON.stringify(v).replace(/</g, '\\u003c').replace(/>/g, '\\u003e').replace(/&/g, '\\u0026').replace(/\u2028|\u2029/g, '');
export function renderReport(webview: vscode.Webview, report: ReportData): string {
  const nonce = randomBytes(16).toString('base64');
  const verified = report.findings.filter(f => f.evidence === 'verified').length;
  const unknown = report.findings.filter(f => f.evidence === 'unknown').length;
  const tabs = ['Overview', 'Findings', 'Test Selection', 'Insights'];
  const rows = report.findings.map(f => `<article class="item">
    <span class="tag ${f.evidence === 'verified' ? 'warn' : 'subtle'}">${safe(f.evidence)}</span>
    <div class="item-text"><strong>${safe(f.kind.replaceAll('-', ' '))}</strong><p>${safe(f.message)}</p><small>${safe(f.file)}${f.line ? ':' + f.line : ''}</small></div>
    <button class="ghost" data-action="open" data-path="${safe(f.file)}" data-line="${f.line ?? 1}">Open file</button>
  </article>`).join('');
  const tests = report.tests.map(t => `<article class="item"><span class="tag subtle">Potential</span><div class="item-text"><strong>${safe(t.path)}</strong><p>${safe(t.reason)}</p></div><button class="ghost" data-action="open" data-path="${safe(t.path)}" data-line="1">Open</button></article>`).join('');
  return `<!doctype html><html lang="en"><head><meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'nonce-${nonce}'; script-src 'nonce-${nonce}';">
<title>TestLens — Test Intelligence</title>
<style nonce="${nonce}">
:root {color-scheme:light dark;font-family:var(--vscode-font-family);color:var(--vscode-foreground);background:var(--vscode-editor-background);}
*{box-sizing:border-box}body{margin:0}button{font:inherit;cursor:pointer}
.shell{max-width:1360px;margin:auto;padding:30px 34px 64px}
.header{display:flex;justify-content:space-between;align-items:center;gap:24px;margin-bottom:24px}
.brand{display:flex;align-items:center;gap:15px}.mark{display:grid;place-items:center;height:44px;width:44px;border:1px solid var(--vscode-focusBorder);border-radius:12px;color:var(--vscode-focusBorder);background:var(--vscode-editorWidget-background);font-size:25px}
h1{font-size:26px;margin:0;font-weight:700}h2{font-size:18px;margin:0 0 14px}p{margin:6px 0;color:var(--vscode-descriptionForeground);line-height:1.55}.muted,small{color:var(--vscode-descriptionForeground);font-size:12px}
.header-meta{display:flex;gap:8px;flex-wrap:wrap;justify-content:flex-end}
.tag{display:inline-flex;align-items:center;border:1px solid var(--vscode-panel-border);padding:5px 10px;border-radius:999px;font-size:12px;text-transform:capitalize;background:var(--vscode-editorWidget-background)}
.warn{color:var(--vscode-editorWarning-foreground);border-color:var(--vscode-editorWarning-foreground)}
.subtle{color:var(--vscode-descriptionForeground)}
.tabs{display:flex;gap:5px;flex-wrap:wrap;padding:5px;border:1px solid var(--vscode-panel-border);background:var(--vscode-editorWidget-background);border-radius:10px;margin-bottom:26px}
.tab{border:0;background:transparent;color:var(--vscode-descriptionForeground);border-radius:7px;padding:9px 14px}
.tab[aria-selected="true"]{color:var(--vscode-foreground);background:var(--vscode-tab-activeBackground);box-shadow:inset 0 -2px var(--vscode-focusBorder)}
button:focus-visible{outline:2px solid var(--vscode-focusBorder);outline-offset:2px}
.metric-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(175px,1fr));gap:12px;margin-bottom:26px}
.card{border:1px solid var(--vscode-panel-border);background:var(--vscode-editorWidget-background);border-radius:11px;padding:18px;min-width:0}
.metric{font-size:32px;font-weight:700;margin-bottom:8px}.section{margin:25px 0}.list{display:grid;gap:10px}
.item{display:flex;align-items:flex-start;gap:12px;padding:14px;border:1px solid var(--vscode-panel-border);border-radius:10px;background:var(--vscode-editorWidget-background)}
.item-text{flex:1;min-width:0;overflow-wrap:anywhere}.item-text strong{font-size:13px}.item-text p{font-size:13px}
.primary{padding:10px 15px;color:var(--vscode-button-foreground);background:var(--vscode-button-background);border:0;border-radius:7px}
.primary:hover{background:var(--vscode-button-hoverBackground)}
.ghost{padding:8px 12px;background:transparent;border:1px solid var(--vscode-panel-border);border-radius:7px;color:var(--vscode-foreground)}
.ghost:hover{background:var(--vscode-toolbar-hoverBackground)}
.actions{display:flex;gap:10px;flex-wrap:wrap;margin-top:14px}
.note{border-left:3px solid var(--vscode-focusBorder);padding:12px 15px;background:var(--vscode-textBlockQuote-background);font-size:13px}
[hidden]{display:none!important}@media(max-width:600px){.shell{padding:18px}.header{align-items:flex-start;flex-direction:column}.item{flex-wrap:wrap}.metric-grid{grid-template-columns:repeat(2,minmax(0,1fr))}}
</style></head><body><main class="shell">
<header class="header"><div class="brand"><div class="mark" aria-hidden="true">◎</div><div><h1>Aetherexa / TestLens</h1><p>See Beyond Test Coverage · Developer Intelligence Workspace</p><small>${safe(report.workspace)}</small></div></div><div class="header-meta"><span class="tag">Local-first</span><span class="tag">${safe(report.framework)}</span></div></header>
<nav class="tabs" role="tablist" aria-label="TestLens report sections">${tabs.map((t,i)=>`<button class="tab" type="button" role="tab" aria-controls="panel-${i}" aria-selected="${i===0}" data-tab="${i}">${t}</button>`).join('')}</nav>
<section id="panel-0" role="tabpanel" aria-label="Overview">
<div class="metric-grid"><div class="card"><div class="metric">${report.changes}</div><small>Changed source files</small></div><div class="card"><div class="metric">${verified}</div><small>Verified coverage gaps</small></div><div class="card"><div class="metric">${unknown}</div><small>Unknown evidence</small></div><div class="card"><div class="metric">${report.tests.length}</div><small>Potential related tests</small></div></div>
<div class="section"><h2>Change intelligence</h2><div class="card"><strong>${safe(report.status)}</strong><p>${safe(report.coverageSource)}</p><div class="actions"><button class="primary" data-action="analyze">Analyze workspace</button><button class="ghost" data-action="run">Run related tests</button></div></div></div>
<div class="section"><h2>Priority findings</h2><div class="list">${rows || '<div class="card"><p>No coverage gaps detected in available evidence. This does not prove every scenario is tested.</p></div>'}</div></div></section>
<section id="panel-1" role="tabpanel" aria-label="Findings" hidden><h2>Coverage findings</h2><p>Verified means uncovered in the supplied coverage snapshot; unknown means evidence is missing or ambiguous.</p><div class="list">${rows || '<div class="card">No findings.</div>'}</div></section>
<section id="panel-2" role="tabpanel" aria-label="Test Selection" hidden><h2>Smart test selection</h2><p>Static relationships and filenames are suggestive, not exhaustive. Review before running.</p><div class="actions"><button class="primary" data-action="run">Run related tests</button></div><div class="section list">${tests || '<div class="card">No related test candidates identified.</div>'}</div></section>
<section id="panel-3" role="tabpanel" aria-label="Insights" hidden><h2>Evidence & methodology</h2><div class="note">TestLens separates observed coverage gaps from potential or unknown findings. Results may be stale until coverage is regenerated after the change.</div><div class="section card"><strong>Coverage source</strong><p>${safe(report.coverageSource)}</p><strong>Test framework</strong><p>${safe(report.framework)}</p></div></section>
</main><script nonce="${nonce}">
const vscode=acquireVsCodeApi();const tabs=[...document.querySelectorAll('[data-tab]')];
for(const tab of tabs)tab.addEventListener('click',()=>{const selected=Number(tab.dataset.tab);for(const [i,t] of tabs.entries()){t.setAttribute('aria-selected',String(i===selected));document.getElementById('panel-'+i).hidden=i!==selected;}});
document.addEventListener('click',(event)=>{const button=event.target.closest('button[data-action]');if(!button)return;const action=button.dataset.action;if(action==='open')vscode.postMessage({type:'openFile',path:button.dataset.path,line:Number(button.dataset.line)});else if(action==='run')vscode.postMessage({type:'runTests'});else if(action==='analyze')vscode.postMessage({type:'analyze'});});
</script></body></html>`;
}
