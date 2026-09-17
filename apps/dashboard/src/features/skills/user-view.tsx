import { useEffect, useState } from "react";
import ReactMarkdown from "react-markdown";
import { X } from "lucide-react";
import type { CliCommandPayload, SkillPayload, UserSkillPayload } from "@lxe/desktop-protocol";
import { queryError, useUserSkillsQuery, useUserSkillContentQuery, useUserSkillMutation } from "../../api/queries";
import { useUiText } from "../../shared/i18n";
import { markdownWithoutFrontMatter } from "../../shared/markdown";
import { markdownComponents, markdownRehypePlugins, markdownRemarkPlugins } from "../../shared/ui/markdown";
import { useDialogFocus } from "../../shared/ui/use-dialog-focus";
import type { DetailTarget } from "../../shared/ui/detail-target";
import { SkillsView } from "./view";

export type SkillConversationAction = "create" | "use";

function UserSkillPreview({ skill, close, onUse, onRecycled }: {
  skill: UserSkillPayload;
  close: () => void;
  onUse: () => void;
  onRecycled: (id: string, path: string) => void;
}) {
  const t = useUiText();
  const [path, setPath] = useState("SKILL.md");
  const [source, setSource] = useState(false);
  const dialog = useDialogFocus<HTMLElement>(true, close);
  const query = useUserSkillContentQuery(skill.id, path);
  const data = query.data;
  const mutation = useUserSkillMutation(onRecycled);
  return <div className="modal-backdrop" role="presentation" onMouseDown={event => { if (event.target === event.currentTarget) close(); }}>
    <section className="modal user-skill-modal" role="dialog" aria-modal="true" aria-label={skill.name} ref={dialog} tabIndex={-1}>
      <div className="modal-header"><div><div className="modal-kicker">{t.userSkills.userDirectory}</div><h2>{skill.name}</h2>
        {skill.description ? <div className="modal-subtitle"><p>{skill.description}</p></div> : null}</div>
        <div className="skill-detail-header-actions">
          <button className="skill-enabled-switch" type="button" role="switch" aria-checked={skill.enabled}
            aria-label={t.userSkills.enabledState} disabled={mutation.isPending}
            onClick={() => mutation.mutate({ skill, action: "toggle" })}><span /></button>
          <button className="icon-button" type="button" onClick={close} aria-label={t.detailModal.close}><X size={18} /></button>
        </div></div>
      <div className="modal-content">
        <p className="mono user-skill-location">{skill.location}</p>
        {!skill.available ? <p role="status">{!skill.enabled ? t.userSkills.disabled : t.userSkills.unavailable}</p> : null}
        {skill.unavailable_reason && skill.unavailable_reason !== "disabled" ? <p className="user-skill-error">{
          skill.unavailable_reason === "permission_or_connector" ? t.userSkills.permission : skill.unavailable_reason
        }</p> : null}
        {mutation.isError ? <p role="alert">{queryError(mutation.error)}</p> : null}
        {query.isError ? <p role="alert">{queryError(query.error)}</p> : null}
        {data ? <>
          <div className="user-skill-actions">
            <select aria-label={t.userSkills.files} value={path} onChange={event => setPath(event.target.value)}>
              {data.files.map(file => <option value={file.path} key={file.path}>{file.path}</option>)}
            </select>
            <button onClick={() => setSource(!source)}>{source ? t.skillModal.preview : t.skillModal.source}</button>
          </div>
          {data.binary ? <p>{t.userSkills.binary}</p> : source || !/\.md$/iu.test(path)
            ? <pre className="skill-content-pre">{data.content}</pre>
            : <div className="skill-markdown"><ReactMarkdown components={markdownComponents} remarkPlugins={markdownRemarkPlugins} rehypePlugins={markdownRehypePlugins}>
              {path === "SKILL.md" ? markdownWithoutFrontMatter(data.content) : data.content}
            </ReactMarkdown></div>}
          {data.truncated ? <p role="status">{t.userSkills.truncated}</p> : null}
        </> : query.isPending ? <p>{t.skillModal.loadingContent}</p> : null}
      </div>
      <div className="skill-detail-footer user-skill-actions">
        <button className="skill-recycle-button" type="button" disabled={mutation.isPending}
          onClick={() => mutation.mutate({ skill, action: "delete" })}>{t.userSkills.delete}</button>
        <button type="button" disabled={!skill.available || mutation.isPending} onClick={onUse}>{t.userSkills.use}</button>
      </div>
    </section>
  </div>;
}

export function SkillsCatalogView({ skills, commands, onOpen, onConversation }: {
  skills: SkillPayload[];
  commands: CliCommandPayload[];
  onOpen: (target: DetailTarget) => void;
  onConversation: (action: SkillConversationAction, skill?: SkillPayload) => void;
}) {
  const t = useUiText();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [recycled, setRecycled] = useState("");
  const query = useUserSkillsQuery();
  const selected = query.data?.items.find(skill => skill.id === selectedId);
  useEffect(() => {
    if (query.data && !selected) setSelectedId(null);
  }, [query.data, selected]);
  return <>
    {query.isError ? <p role="alert">{queryError(query.error)}</p> : null}
    {recycled ? <p role="status">{t.userSkills.recycled} <span className="mono user-skill-location">{recycled}</span></p> : null}
    {query.isPending ? <p role="status">{t.skillModal.loadingContent}</p> : null}
    <SkillsView skills={skills} commands={commands} userSkills={query.data?.items ?? []} onOpen={onOpen}
      onOpenUser={skill => setSelectedId(skill.id)} />
    {selected ? <UserSkillPreview key={selected.id} skill={selected} close={() => setSelectedId(null)}
      onUse={() => { setSelectedId(null); onConversation("use", selected); }}
      onRecycled={(_id, path) => { setRecycled(path); setSelectedId(null); }} /> : null}
  </>;
}
