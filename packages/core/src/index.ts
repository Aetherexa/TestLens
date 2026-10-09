export type Evidence = 'verified' | 'potential' | 'unknown';
export interface Finding { id: string; file: string; line?: number; kind: 'uncovered-change'|'uncovered-branch'|'possible-missing-test'|'missing-coverage'; evidence: Evidence; message: string; }
export interface ChangedFile { path: string; lines: number[]; }
export interface LineCoverage { file: string; lines: Map<number, number>; branches: {line: number; id: string; hits: number}[]; }
export function parseUnifiedDiff(diff: string): ChangedFile[] {
 const result=new Map<string,Set<number>>();let path:string|undefined;let nextLine=0;
 for(const raw of diff.split(/\r?\n/)){
  if(raw.startsWith('+++ ')){const p=raw.slice(4).trim();path=p==='/dev/null'?undefined:p.replace(/^b\//,'');if(path&&!result.has(path))result.set(path,new Set());}
  else if(raw.startsWith('@@ ')){const m=/\+(\d+)(?:,\d+)?\s*@@/.exec(raw);if(m)nextLine=Number(m[1]);}
  else if(path&&raw.startsWith('+')&&!raw.startsWith('+++'))result.get(path)?.add(nextLine++);
  else if(raw.startsWith(' ')&&!raw.startsWith('+++'))nextLine++;
 }
 return [...result].map(([file,lines])=>({path:file,lines:[...lines].sort((a,b)=>a-b)}));
}
export function parseLcov(raw:string):LineCoverage[]{
 const out:LineCoverage[]=[];let current:LineCoverage|undefined;
 for(const line of raw.split(/\r?\n/)){
  if(line.startsWith('SF:')){current={file:line.slice(3),lines:new Map(),branches:[]};out.push(current);}
  else if(current&&line.startsWith('DA:')){const m=/^DA:(\d+),(-?\d+)/.exec(line);if(m)current.lines.set(Number(m[1]),Number(m[2]));}
  else if(current&&line.startsWith('BRDA:')){const m=/^BRDA:(\d+),([^,]+),([^,]+),([^,]+)/.exec(line);if(m)current.branches.push({line:Number(m[1]),id:`${m[2]}:${m[3]}`,hits:m[4]==='-'?Number.NaN:Number(m[4])});}
  else if(line==='end_of_record')current=undefined;
 }return out;
}
export function parseIstanbul(input:Record<string,any>):LineCoverage[]{
 return Object.entries(input).map(([file,cov])=>{
  const lines=new Map<number,number>();const branches:LineCoverage['branches']=[];
  for(const [id,hits] of Object.entries(cov.s??{})){const line=cov.statementMap?.[id]?.start?.line;if(Number.isInteger(line))lines.set(line,(lines.get(line)??0)+Number(hits));}
  for(const [id,hits] of Object.entries(cov.f??{})){const line=cov.fnMap?.[id]?.loc?.start?.line;if(Number.isInteger(line)&&!lines.has(line))lines.set(line,Number(hits));}
  for(const [id,counts] of Object.entries(cov.b??{})){const line=cov.branchMap?.[id]?.line??cov.branchMap?.[id]?.loc?.start?.line;if(Number.isInteger(line)&&Array.isArray(counts))counts.forEach((hits,i)=>branches.push({line,id:`${id}:${i}`,hits:Number(hits)}));}
  return {file,lines,branches};
 });
}
function normalize(p:string):string{return p.replace(/\\/g,'/').replace(/^\.\//,'');}
function matches(coveragePath:string,changedPath:string):boolean{const a=normalize(coveragePath),b=normalize(changedPath);return a===b||a.endsWith('/'+b);}
export function analyzeGaps(changes:ChangedFile[],coverage:LineCoverage[]):Finding[]{
 const findings:Finding[]=[];
 for(const change of changes){
  if(!/\.[cm]?[jt]sx?$/.test(change.path))continue;
  const reports=coverage.filter(c=>matches(c.file,change.path));
  if(reports.length>1&&new Set(reports.map(r=>normalize(r.file))).size>1){findings.push({id:`ambiguous:${change.path}`,file:change.path,kind:'missing-coverage',evidence:'unknown',message:'Multiple coverage paths match the changed file; attribution ambiguous.'});continue;}
  if(!reports.length){findings.push({id:`missing:${change.path}`,file:change.path,kind:'missing-coverage',evidence:'unknown',message:'No matching coverage report; cannot establish whether this change is tested.'});continue;}
  const known=new Map<number,number>();const branches=new Map<string,{line:number;hits:number}>();
  for(const r of reports){for(const [line,hits] of r.lines)known.set(line,Math.max(hits,known.get(line)??0));for(const b of r.branches){const key=`${b.line}:${b.id}`;const prev=branches.get(key);branches.set(key,{line:b.line,hits:Math.max(b.hits,prev?.hits??0)});}}
  for(const line of change.lines)if(known.has(line)&&known.get(line)===0)findings.push({id:`line:${change.path}:${line}`,file:change.path,line,kind:'uncovered-change',evidence:'verified',message:'Changed executable line has zero hits in supplied coverage report.'});
  for(const [id,b] of branches)if(change.lines.includes(b.line)&&Number.isFinite(b.hits)&&b.hits===0)findings.push({id:`branch:${change.path}:${id}`,file:change.path,line:b.line,kind:'uncovered-branch',evidence:'verified',message:'Branch has zero hits in supplied coverage report.'});
 }return findings;
}
export type Framework='jest'|'vitest'|'unknown';
export function detectFramework(pkg:{dependencies?:Record<string,string>;devDependencies?:Record<string,string>;scripts?:Record<string,string>}):Framework{
 const deps={...pkg.dependencies,...pkg.devDependencies};if(deps.vitest)return 'vitest';if(deps.jest)return 'jest';
 if(Object.values(pkg.scripts??{}).some(s=>/\bvitest\b/.test(s)))return 'vitest';
 if(Object.values(pkg.scripts??{}).some(s=>/\bjest\b/.test(s)))return 'jest';return 'unknown';
}
export interface SuggestedTest{path:string;reason:string;evidence:'potential';}
export interface TestSelection extends SuggestedTest{method:'direct-import'|'transitive-import'|'filename';}
function resolveImport(origin:string,specifier:string):string|undefined{
 if(!specifier.startsWith('.'))return undefined;
 const parts=normalize(origin).split('/');parts.pop();
 for(const segment of specifier.split('/')){if(segment==='.'||!segment)continue;if(segment==='..')parts.pop();else parts.push(segment);}
 return parts.join('/').replace(/\.[cm]?[jt]sx?$/,'').replace(/\/index$/,'');
}
function moduleKey(file:string):string{return normalize(file).replace(/\.[cm]?[jt]sx?$/,'').replace(/\/index$/,'');}
export function mapTestDependencies(changed:string[],sources:Record<string,string>,candidates:string[],maxDepth=12):TestSelection[]{
 const graph=new Map<string,string[]>();
 for(const [file,content] of Object.entries(sources)){
  const edges:string[]=[];const re=/(?:\bimport\s*(?:[^'";]*?\s+from\s*)?|\bexport\s+[^'";]*?\s+from\s*|\brequire\s*\()\s*['"]([^'"]+)['"]/g;
  for(const match of content.matchAll(re)){const edge=resolveImport(file,match[1]);if(edge)edges.push(edge);}
  graph.set(moduleKey(file),edges);
 }
 const targets=new Set(changed.map(moduleKey));const results=new Map<string,TestSelection>();
 for(const candidate of candidates){
  const start=moduleKey(candidate);const visited=new Set<string>();let queue=[start],depth=0,found=false;
  while(queue.length&&depth<=maxDepth&&!found){const next:string[]=[];
   for(const node of queue){if(visited.has(node))continue;visited.add(node);
    if(depth>0&&targets.has(node)){results.set(candidate,{path:candidate,method:depth===1?'direct-import':'transitive-import',reason:`Static import dependency (${depth} hops) links test to changed code.`,evidence:'potential'});found=true;break;}
    next.push(...(graph.get(node)??[]));}
   queue=next;depth++;
  }
 }
 for(const s of suggestRelatedTests(changed,candidates))if(!results.has(s.path))results.set(s.path,{...s,method:'filename'});
 return [...results.values()].sort((a,b)=>a.path.localeCompare(b.path));
}
export function suggestRelatedTests(changed:string[],candidates:string[]):SuggestedTest[]{
 const found=new Map<string,SuggestedTest>();
 for(const file of changed){const stem=file.split('/').pop()?.replace(/\.[cm]?[jt]sx?$/,'');if(!stem)continue;
  for(const test of candidates){if(!/\.(test|spec)\.[cm]?[jt]sx?$/.test(test))continue;
   const basename=test.split('/').pop()??'';if(basename.startsWith(stem+'.')||basename.startsWith(stem+'-'))found.set(test,{path:test,reason:`Filename aligns with changed module ${file}; verify dependencies before relying on selection.`,evidence:'potential'});
  }
 }return [...found.values()];
}