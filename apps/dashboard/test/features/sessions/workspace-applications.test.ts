import { expect, test } from 'bun:test';
import { CHOICE_KEY, WorkspaceApplicationState } from '../../../src/features/workspace-apps/state';
const apps=[{id:'finder',name:'Finder',icon:null},{id:'vscode',name:'VS Code',icon:null}];
test('successful explicit choice persists globally; failure and duplicate gestures never replace it', async () => {
  const values=new Map<string,string>(), calls:unknown[]=[];
  let fail=false, finish:()=>void=()=>{};
  const state=new WorkspaceApplicationState(()=>({getWorkspaceApplications:async()=>apps,openWorkspace:async(...args)=>{calls.push(args);if(fail)throw new Error('launch EACCES');await new Promise<void>(r=>finish=r);}}),()=>({getItem:k=>values.get(k)??null,setItem:(k,v)=>{values.set(k,v);}}));
  await state.load();const opening=state.open('/first','vscode',true);await expect(state.open('/second','finder',true)).rejects.toThrow('in progress');
  finish();await opening;expect(calls).toEqual([['/first','vscode']]);expect(values.get(CHOICE_KEY)).toBe('vscode');
  fail=true;await expect(state.open('/second','finder',true)).rejects.toThrow('launch EACCES');expect(state.getSnapshot().choice).toBe('vscode');
  expect(new WorkspaceApplicationState(()=>({} as never),()=>({getItem:()=>values.get(CHOICE_KEY)!,setItem:()=>{}})).getSnapshot().choice).toBe('vscode');
});
test('query failure is visible and retryable; broken local storage does not block system open', async () => {
  let fail=true, queries=0;const calls:unknown[]=[];
  const state=new WorkspaceApplicationState(()=>({getWorkspaceApplications:async()=>{queries++;if(fail)throw new Error('registry refused');return apps;},openWorkspace:async(...args)=>{calls.push(args);}}),()=>{throw new Error('storage disabled');});
  await Promise.all([state.load(),state.load()]);expect(queries).toBe(1);expect(state.getSnapshot().error).toBe('registry refused');
  await state.open('/workspace','finder',true);expect(calls).toEqual([['/workspace',undefined]]);
  fail=false;await state.load(true);expect(state.getSnapshot().error).toBe('');expect(state.getSnapshot().apps).toEqual(apps);
});
