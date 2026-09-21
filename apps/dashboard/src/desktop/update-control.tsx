import {useEffect,useState} from "react";
import {Download,AlertCircle} from "lucide-react";
import type {DesktopUpdateState} from "@lxe/desktop-protocol";
import {useDialogFocus} from "../shared/ui/use-dialog-focus";
import {useUiText} from "../shared/i18n";

export function UpdateControl({manual=false}:{manual?:boolean}){
 const t=useUiText().updates;
 const [state,setState]=useState<DesktopUpdateState>({phase:"unsupported"});
 const [open,setOpen]=useState(false);
 const [busy,setBusy]=useState(false);
 const close=()=>{if(!busy)setOpen(false);};
 const dialog=useDialogFocus<HTMLDivElement>(open,close);
 useEffect(()=>{
  const api=window.lxe?.desktop;
  if(!api?.getUpdateState)return;
  let stopped=false,pending=false;
  const poll=async()=>{if(pending)return;pending=true;try{const s=await api.getUpdateState!();if(!stopped)setState(s);}finally{pending=false;}};
  void poll().catch(()=>{});
  const timer=setInterval(()=>{void poll().catch(()=>{});},1000);
  return ()=>{stopped=true;clearInterval(timer);};
 },[]);
 const working=["checking","downloading","verifying","installing"].includes(state.phase);
 const ready=state.phase==="ready";
 const label=state.phase==="downloading"?t.downloading+(state.percent===undefined?"":" · "+Math.floor(state.percent)+"%")
  :state.phase==="verifying"?t.verifying:state.phase==="installing"?t.installing:state.phase==="checking"?t.checking:state.phase==="error"?t.failed:t.update;
 const action=async(install=false)=>{
  const api=window.lxe?.desktop;if(!api)return;
  setBusy(true);
  try{const next=install?await api.installUpdate?.():await api.checkForUpdate?.();if(next)setState(next);}
  catch(error){setState({phase:"error",message:String(error)});}
  finally{setBusy(false);}
 };
 if(state.phase==="unsupported")return null;
 if(!manual&&["idle","paused"].includes(state.phase))return null;
 const ring=working;
 const percent=state.phase==="downloading"?state.percent:undefined;
 return <>
  {manual?<button type="button" className="desktop-secondary-button" onClick={()=>setOpen(true)}>{t.check}</button>:
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
  {open?<div className="modal-backdrop lxe-update-backdrop" onMouseDown={event=>{if(event.target===event.currentTarget)close();}}>
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
  </div>:null}
 </>;
}
