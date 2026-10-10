import { renderReport, type ReportData } from './report.js';
import * as vscode from 'vscode';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {readFile} from 'node:fs/promises';
import {analyzeGaps,detectFramework,parseIstanbul,parseLcov,parseUnifiedDiff,mapTestDependencies,type Finding,type SuggestedTest} from '../../core/src/index.js';
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
 let reportPanel:vscode.WebviewPanel|undefined;
 let latestReport:ReportData|undefined;
 const openReport=():void=>{
  if(!reportPanel){
   reportPanel=vscode.window.createWebviewPanel('testlens.report','TestLens — Test Intelligence',vscode.ViewColumn.Active,{enableScripts:true,retainContextWhenHidden:true});
   ctx.subscriptions.push(reportPanel.webview.onDidReceiveMessage(async (message:unknown)=>{
    if(!message||typeof message!=='object')return;
    const msg=message as {type?:string;path?:string;line?:number};
    if(msg.type==='analyze')await vscode.commands.executeCommand('testlens.analyze');
    if(msg.type==='runTests')await vscode.commands.executeCommand('testlens.runRelated');
    if(msg.type==='openFile'&&msg.path){
     const folder=vscode.workspace.workspaceFolders?.[0];
     if(!folder)return;
     const path=await import('node:path');
     const resolved=path.resolve(folder.uri.fsPath,msg.path);
     const relative=path.relative(folder.uri.fsPath,resolved);
     if(relative.startsWith('..')||path.isAbsolute(relative))return;
     const document=await vscode.workspace.openTextDocument(vscode.Uri.file(resolved));
     await vscode.window.showTextDocument(document,{preview:true,selection:new vscode.Range(Math.max(0,(msg.line??1)-1),0,Math.max(0,(msg.line??1)-1),0)});
    }
   }));
   reportPanel.onDidDispose(()=>{reportPanel=undefined;});
  }
  reportPanel.webview.html=renderReport(reportPanel.webview,latestReport??{workspace:vscode.workspace.workspaceFolders?.[0]?.name??'No workspace',framework:'Unknown',changes:0,findings:[],tests:[],coverageSource:'Run analysis to load coverage evidence.',status:'Run Analyze Workspace to begin.'});
  reportPanel.reveal();
 };
 ctx.subscriptions.push(vscode.commands.registerCommand('testlens.openReport',openReport));
 ctx.subscriptions.push(vscode.commands.registerCommand('testlens.analyze',async()=>{
  const folder=vscode.workspace.workspaceFolders?.[0];if(!folder){vscode.window.showWarningMessage('TestLens needs an open workspace.');return;}
  if(!vscode.workspace.isTrusted){vscode.window.showWarningMessage('Trust the workspace before running TestLens analysis.');return;}
  const root=folder.uri.fsPath;
  try{
   const pkgText=await readOptional(vscode.Uri.joinPath(folder.uri,'package.json').fsPath);
   detected=detectFramework(pkgText?JSON.parse(pkgText):{});
   const diff=parseUnifiedDiff(await changedFiles(root));
   if(!diff.length){latestReport={workspace:folder.name,framework:detected,changes:0,findings:[],tests:[],coverageSource:'No changed source files were detected.',status:'No modified tracked lines. Stage or modify a tracked source file.'};provider.setItems([{label:'No modified tracked lines',detail:'Stage or modify tracked code to analyze.'}]);openReport();return;}
   const lcov=await readOptional(vscode.Uri.joinPath(folder.uri,'coverage','lcov.info').fsPath);
   const json=lcov?undefined:await readOptional(vscode.Uri.joinPath(folder.uri,'coverage','coverage-final.json').fsPath);
   const coverage=lcov?parseLcov(lcov):json?parseIstanbul(JSON.parse(json)):[];
   const findings:Finding[]=analyzeGaps(diff,coverage);
   const candidates=await listTestFiles(folder.uri);
   const workspaceFiles=await vscode.workspace.findFiles(new vscode.RelativePattern(folder.uri,'**/*.{ts,tsx,js,jsx,mts,mjs,cts,cjs}'),'**/{node_modules,dist,coverage,out}/**',4000);
   const sources:Record<string,string>={};
   for(const uri of workspaceFiles) {const relative=vscode.workspace.asRelativePath(uri,false).replace(/\\/g,'/');const content=await readOptional(uri.fsPath);if(content!==undefined)sources[relative]=content;}
   recent=mapTestDependencies(diff.map(d=>d.path),sources,candidates);
   latestReport={workspace:folder.name,framework:detected,changes:diff.length,findings,tests:recent,
    coverageSource:lcov?'LCOV snapshot (coverage/lcov.info)':json?'Istanbul JSON snapshot (coverage/coverage-final.json)':'No coverage report was found.',
    status:`Analyzed ${diff.length} changed source files.`};
   const items:ViewItem[]=[
    {label:'Coverage evidence',detail:lcov||json?'Coverage snapshot may be stale: regenerate after changes before treating findings as current.':'No coverage report found.'},
    {label:`${findings.filter(f=>f.evidence==='verified').length} verified coverage findings`,detail:'Based on supplied local coverage report'},
    {label:`${recent.length} possible related test files`,detail:'Static import / filename heuristic — may miss dependencies'},
    ...findings.map(f=>({label:`${f.evidence.toUpperCase()}: ${f.kind}`,detail:`${f.file}${f.line?':'+f.line:''} — ${f.message}`,file:vscode.Uri.joinPath(folder.uri,f.file).fsPath,line:f.line})),
    ...recent.map(r=>({label:`Possible test: ${r.path}`,detail:r.reason,file:vscode.Uri.joinPath(folder.uri,r.path).fsPath}))
   ];provider.setItems(items);openReport();
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
