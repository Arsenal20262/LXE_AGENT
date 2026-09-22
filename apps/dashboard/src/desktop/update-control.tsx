import {useEffect,useRef,useState} from "react";
import {createPortal} from "react-dom";
import {Download,AlertCircle,RefreshCw,Check} from "lucide-react";
import type {DesktopUpdateState} from "@lxe/desktop-protocol";
import {useDialogFocus} from "../shared/ui/use-dialog-focus";
import {useUiText} from "../shared/i18n";

export function UpdateControl({manual=false}:{manual?:boolean}){
 const t=useUiText().updates;
 const [state,setState]=useState<DesktopUpdateState>({phase:"unsupported"});
 const [open,setOpen]=useState(false);
 const [busy,setBusy]=useState(false);
 const actionPending=useRef(false);
 const revision=useRef(0);
 const close=()=>{if(!busy)setOpen(false);};
 const dialog=useDialogFocus<HTMLDivElement>(open,close);
 useEffect(()=>{
  const api=window.lxe?.desktop;
  if(!api?.getUpdateState)return;
  let stopped=false,pending=false;
  const poll=async()=>{if(pending)return;pending=true;const started=revision.current;try{const s=await api.getUpdateState!();if(!stopped&&started===revision.current)setState(s);}finally{pending=false;}};
  void poll().catch(()=>{});
  const timer=setInterval(()=>{void poll().catch(()=>{});},1000);
  return ()=>{stopped=true;clearInterval(timer);};
 },[]);
 const working=["checking","downloading","verifying","installing"].includes(state.phase);
 const ready=state.phase==="ready";
 const label=state.phase==="downloading"?t.downloading+(state.percent===undefined?"":" · "+Math.floor(state.percent)+"%")
  :state.phase==="verifying"?t.verifying:state.phase==="installing"?t.installing:state.phase==="checking"?t.checking:state.phase==="error"?t.failed:t.update;
 const action=async(install=false)=>{
  const api=window.lxe?.desktop;
  if(!api||actionPending.current||working||!(install?api?.installUpdate:api?.checkForUpdate))return;
  actionPending.current=true;
  revision.current++;
  setBusy(true);
  setState(previous=>({...previous,phase:install?"installing":"checking",message:undefined}));
  try{const next=install?await api.installUpdate?.():await api.checkForUpdate?.();if(next)setState(next);}
  catch(error){setState({phase:"error",message:String(error)});}
  finally{revision.current++;actionPending.current=false;setBusy(false);}
 };
 if(state.phase==="unsupported")return null;
 if(!manual&&["idle","paused"].includes(state.phase))return null;
 const ring=working;
 const percent=state.phase==="downloading"&&Number.isFinite(state.percent)?Math.min(100,Math.max(0,state.percent!)):undefined;
 const noUpdate=state.phase==="idle"&&Boolean(state.message);
 const manualLabel=working?label:ready?t.restart:state.phase==="error"?t.details:state.phase==="paused"?t.paused:noUpdate?t.noUpdate:t.check;
 return <>
  {manual?<span className="lxe-update-manual" aria-live="polite">
   <button type="button" className="lxe-update-manual-button" disabled={busy||working}
    title={state.phase==="error"?t.details:ready?t.restart:t.check}
    aria-label={noUpdate?`${manualLabel} · ${t.check}`:manualLabel}
    onClick={()=>{if(ready||state.phase==="error")setOpen(true);else void action();}}>
    {working?<svg aria-hidden="true" viewBox="0 0 32 32" className={"lxe-update-ring"+(percent===undefined?" is-spinning":"")}>
     <circle cx="16" cy="16" r="13" className="ring-track"/>
     <circle cx="16" cy="16" r="13" className="ring-progress" pathLength="100" strokeDasharray="100" strokeDashoffset={percent===undefined?72:100-percent}/>
    </svg>:state.phase==="error"?<AlertCircle size={14}/>:noUpdate?<Check size={14}/>:<RefreshCw size={14}/>}
    <span>{manualLabel}</span>
   </button>
  </span>:
   <span className="lxe-update-slot">
    <button type="button" className={"lxe-update-button"+(ready?" is-ready":"")+(ring?" is-working":"")}
     title={label} aria-label={label} onClick={()=>setOpen(true)}>
     {ring?<svg aria-hidden="true" viewBox="0 0 32 32" className={"lxe-update-ring"+(percent===undefined?" is-spinning":"")}>
      <circle cx="16" cy="16" r="13" className="ring-track"/>
      <circle cx="16" cy="16" r="13" className="ring-progress" pathLength="100" strokeDasharray="100"
       strokeDashoffset={percent===undefined?72:100-percent}/>
     </svg>:null}
     {state.phase==="error"?<AlertCircle size={16}/>:<Download size={16}/>}
     {ready?<span className="lxe-update-label">{t.update}</span>:null}
    </button>
   </span>}
  {open?createPortal(<div className="modal-backdrop lxe-update-backdrop" onMouseDown={event=>{if(event.target===event.currentTarget)close();}}>
   <div ref={dialog} role="dialog" aria-modal="true" aria-label={t.title} tabIndex={-1} className="lxe-update-dialog">
    <h2>{t.title}{state.release?" · "+state.release.version:""}</h2>
    {state.release?<p className="lxe-update-notes">{state.release.notes}</p>:null}
    {working?<p role="status">{label}</p>:null}
    {state.lastAttempt?<p role="status">{state.lastAttempt}</p>:null}
    {state.message?<p role={state.phase==="error"?"alert":"status"}>{state.message}</p>:null}
    {ready?<p>{t.confirm}</p>:null}
    <div className="lxe-update-actions">
     <button type="button" onClick={close} disabled={busy}>{t.close}</button>
     <button type="button" disabled={busy||working} onClick={()=>void action(ready)}>
      {ready?t.restart:state.phase==="error"?t.retry:t.check}
     </button>
    </div>
   </div>
  </div>,document.body):null}
 </>;
}
