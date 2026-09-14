import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import ReactMarkdown from "react-markdown";
import { X } from "lucide-react";
import type { SkillPayload, UserSkillPayload } from "@lxe/desktop-protocol";
import { callDashboard } from "../../api/client";
import { dashboardQueryKeys } from "../../api/query-keys";
import { queryError } from "../../api/queries";
import { useUiText } from "../../shared/i18n";
import { markdownWithoutFrontMatter } from "../../shared/markdown";
import { markdownComponents, markdownRehypePlugins, markdownRemarkPlugins } from "../../shared/ui/markdown";
import { useDialogFocus } from "../../shared/ui/use-dialog-focus";

export type SkillConversationAction = "create" | "use" | "edit";

function UserSkillPreview({ skill, close }: { skill: UserSkillPayload; close: () => void }) {
  const t = useUiText();
  const [path, setPath] = useState("SKILL.md");
  const [source, setSource] = useState(false);
  const dialog = useDialogFocus<HTMLElement>(true, close);
  const query = useQuery({ queryKey: ["skills", "user", "content", skill.id, path],
    queryFn: () => callDashboard({ operation: "skills.user.content", input: { id: skill.id, path } }) });
  const data = query.data;
  return <div className="modal-backdrop" role="presentation" onMouseDown={event => { if (event.target === event.currentTarget) close(); }}>
    <section className="modal" role="dialog" aria-modal="true" aria-label={skill.name} ref={dialog} tabIndex={-1}>
      <div className="modal-header"><div><div className="modal-kicker">{t.userSkills.title}</div><h2>{skill.name}</h2></div>
        <button className="icon-button" onClick={close} aria-label={t.detailModal.close}><X size={18} /></button></div>
      <div className="modal-content">
        <p className="mono user-skill-location">{skill.location}</p>
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
    </section>
  </div>;
}

export function UserSkillsView({ onConversation }: { onConversation: (action: SkillConversationAction, skill?: SkillPayload) => void }) {
  const t = useUiText();
  const client = useQueryClient();
  const [selected, setSelected] = useState<UserSkillPayload | null>(null);
  const [recycled, setRecycled] = useState("");
  const query = useQuery({ queryKey: ["skills", "user", "list"],
    queryFn: () => callDashboard({ operation: "skills.user.list", input: {} }) });
  const mutation = useMutation({
    mutationFn: async ({ skill, action }: { skill: UserSkillPayload; action: "toggle" | "delete" }) => {
      if (action === "toggle") await callDashboard({ operation: "skills.user.setEnabled",
        input: { id: skill.id, version: skill.version, enabled: !skill.enabled } });
      else {
        const result = await callDashboard({ operation: "skills.user.delete", input: { id: skill.id, version: skill.version } });
        setRecycled(result.recycled_path);
        if (selected?.id === skill.id) setSelected(null);
      }
    },
    onSettled: () => client.invalidateQueries({ queryKey: dashboardQueryKeys.skills.all }),
  });
  return <section className="user-skills-section catalog-section" aria-label={t.userSkills.title}>
    <div className="user-skills-header"><div><h2>{t.userSkills.title}</h2><p>{t.userSkills.hint}</p></div>
      <button onClick={() => onConversation("create")}>{t.userSkills.create}</button></div>
    {query.isError || mutation.isError ? <p role="alert">{queryError(mutation.error || query.error)}</p> : null}
    {recycled ? <p role="status">{t.userSkills.recycled} <span className="mono user-skill-location">{recycled}</span></p> : null}
    {query.isPending ? <p>{t.skillModal.loadingContent}</p> : !query.data?.items.length ? <p>{t.userSkills.empty}</p> : null}
    <div className="grid-list catalog-grid">
      {query.data?.items.map(skill => <article className="item-card catalog-item" key={skill.id}>
        <h3>{skill.name}</h3><p className="description">{skill.description}</p>
        <p className="pill">{skill.available ? t.userSkills.available : !skill.enabled ? t.userSkills.disabled : t.userSkills.unavailable}</p>
        {skill.unavailable_reason && skill.unavailable_reason !== "disabled" ? <p className="user-skill-error">{
          skill.unavailable_reason === "permission_or_connector" ? t.userSkills.permission : skill.unavailable_reason
        }</p> : null}
        <div className="user-skill-actions">
          <button onClick={() => setSelected(skill)}>{t.userSkills.view}</button>
          <button disabled={!skill.available} onClick={() => onConversation("use", skill)}>{t.userSkills.use}</button>
          <button onClick={() => onConversation("edit", skill)}>{t.userSkills.edit}</button>
          <button disabled={mutation.isPending} onClick={() => mutation.mutate({ skill, action: "toggle" })}>{skill.enabled ? t.userSkills.disable : t.userSkills.enable}</button>
          <button disabled={mutation.isPending} onClick={() => mutation.mutate({ skill, action: "delete" })}>{t.userSkills.delete}</button>
        </div>
      </article>)}
    </div>
    {selected ? <UserSkillPreview skill={selected} close={() => setSelected(null)} /> : null}
  </section>;
}
