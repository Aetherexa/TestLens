import * as vscode from 'vscode';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {readFile} from 'node:fs/promises';
import {analyzeGaps,detectFramework,parseIstanbul,parseLcov,parseUnifiedDiff,mapTestDependencies,type Finding,type SuggestedTest} from '../../../packages/core/src/index.js';
const execFileAsync=promisify(execFile);
interface ViewItem {label:string;detail:string;file?:string;line?:number;context?:string;}
class GapProvider implements vscode.TreeDataProvider<ViewItem> {
 private entries:ViewItem[]=[{label:'Run TestLens: Analyze Workspace',detail:'Select the command from the palette'}];
 private emitter=new vscode.EventEmitter<void>(); readonly onDidChangeTreeData=this.emitter.event;
 setItems(items:ViewItem[]):void {this.entries=items;this.emitter.fire();}
 getTreeItem(item:ViewItem):vscode.TreeItem {const x=new vscode.TreeItem(item.label);x.description=item.detail;x.tooltip=item.detail;
  if(item.file){x.command={command:'vscode.open',title:'Open finding',arguments:[vscode.Uri.file(item.file),{selection:new vscode.Range(Math.max(0,(item.line??1)-1),0,Math.max(0,(item.line??1)-1),0)}]};}
  x.contextValue=item.context;return x;
 }
 getChildren():ViewItem[]{return this.entries;}
}
async function readOptional(path:string):Promise<string|undefined>{try{return await readFile(path,'utf8');}catch{return undefined;}}
async function changedFiles(root:string):Promise<string>{
 const opts={cwd:root,maxBuffer:12*1024*1024,timeout:20000};
 const [working,staged]=await Promise.all([
  execFileAsync('git',['diff','--no-ext-diff','--unified=0','--','*.ts','*.tsx','*.js','*.jsx'],opts),
  execFileAsync('git',['diff','--cached','--no-ext-diff','--unified=0','--','*.ts','*.tsx','*.js','*.jsx'],opts)
 ]);return working.stdout+'\n'+staged.stdout;
}
async function listTestFiles(root:vscode.Uri):Promise<string[]>{
 const uris=await vscode.workspace.findFiles(new vscode.RelativePattern(root,'**/*.{test,spec}.{ts,tsx,js,jsx,mts,mjs,cts,cjs}'),'**/{node_modules,dist,coverage}/**',2000);
 return uris.map(uri=>vscode.workspace.asRelativePath(uri,false).replace(/\\/g,'/'));
}
export function activate(ctx:vscode.ExtensionContext):void {
 const provider=new GapProvider();ctx.subscriptions.push(vscode.window.registerTreeDataProvider('testlens.findings',provider));
 let recent:SuggestedTest[]=[];let detected:'jest'|'vitest'|'unknown'='unknown';
 ctx.subscriptions.push(vscode.commands.registerCommand('testlens.analyze',async()=>{
  const folder=vscode.workspace.workspaceFolders?.[0];if(!folder){vscode.window.showWarningMessage('TestLens needs an open workspace.');return;}
  if(!vscode.workspace.isTrusted){vscode.window.showWarningMessage('Trust the workspace before running TestLens analysis.');return;}
  const root=folder.uri.fsPath;
  try{
   const pkgText=await readOptional(vscode.Uri.joinPath(folder.uri,'package.json').fsPath);
   detected=detectFramework(pkgText?JSON.parse(pkgText):{});
   const diff=parseUnifiedDiff(await changedFiles(root));
   if(!diff.length){provider.setItems([{label:'No modified tracked lines',detail:'Stage or modify tracked code to analyze.'}]);return;}
   const lcov=await readOptional(vscode.Uri.joinPath(folder.uri,'coverage','lcov.info').fsPath);
   const json=lcov?undefined:await readOptional(vscode.Uri.joinPath(folder.uri,'coverage','coverage-final.json').fsPath);
   const coverage=lcov?parseLcov(lcov):json?parseIstanbul(JSON.parse(json)):[];
   const findings:Finding[]=analyzeGaps(diff,coverage);
   const candidates=await listTestFiles(folder.uri);
   const workspaceFiles=await vscode.workspace.findFiles(new vscode.RelativePattern(folder.uri,'**/*.{ts,tsx,js,jsx,mts,mjs,cts,cjs}'),'**/{node_modules,dist,coverage,out}/**',4000);
   const sources:Record<string,string>={};
   for(const uri of workspaceFiles) {const relative=vscode.workspace.asRelativePath(uri,false).replace(/\\/g,'/');const content=await readOptional(uri.fsPath);if(content!==undefined)sources[relative]=content;}
   recent=mapTestDependencies(diff.map(d=>d.path),sources,candidates);
   const items:ViewItem[]=[
    {label:'Coverage evidence',detail:lcov||json?'Coverage snapshot may be stale: regenerate after changes before treating findings as current.':'No coverage report found.'},
    {label:`${findings.filter(f=>f.evidence==='verified').length} verified coverage findings`,detail:'Based on supplied local coverage report'},
    {label:`${recent.length} possible related test files`,detail:'Static import / filename heuristic — may miss dependencies'},
    ...findings.map(f=>({label:`${f.evidence.toUpperCase()}: ${f.kind}`,detail:`${f.file}${f.line?':'+f.line:''} — ${f.message}`,file:vscode.Uri.joinPath(folder.uri,f.file).fsPath,line:f.line})),
    ...recent.map(r=>({label:`Possible test: ${r.path}`,detail:r.reason,file:vscode.Uri.joinPath(folder.uri,r.path).fsPath}))
   ];provider.setItems(items);
   void vscode.window.showInformationMessage(`TestLens: ${findings.length} coverage findings, ${recent.length} possible related tests (${detected}).`);
  }catch(err){provider.setItems([{label:'Analysis failed',detail:String(err)}]);void vscode.window.showErrorMessage(`TestLens analysis failed: ${String(err)}`);}
 }));
 ctx.subscriptions.push(vscode.commands.registerCommand('testlens.runRelated',async()=>{
  const folder=vscode.workspace.workspaceFolders?.[0];if(!folder || !vscode.workspace.isTrusted){void vscode.window.showWarningMessage('Open and trust a workspace first.');return;}
  if(detected==='unknown' || !recent.length){void vscode.window.showInformationMessage('Analyze a workspace with Jest/Vitest and related tests first.');return;}
  const files=recent.map(r=>r.path);
  const choice=await vscode.window.showWarningMessage(`Run ${files.length} heuristically selected ${detected} test files? Selection may be incomplete.`,{modal:true},'Run selected tests');
  if(choice!=='Run selected tests')return;
  const terminal=vscode.window.createTerminal({name:'TestLens Tests',cwd:folder.uri.fsPath});
  const args=files.map(p=>process.platform==='win32'?`"${p.replace(/"/g,'')}"`:`'${p.replace(/'/g,"'\\''")}'`).join(' ');
  const command=detected==='vitest'?'npx vitest run':'npx jest --runInBand --runTestsByPath';
  terminal.show();terminal.sendText(`${command} ${args}`);
 }));
}
export function deactivate():void {}
