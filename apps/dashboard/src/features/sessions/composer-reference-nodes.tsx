// Inline reference semantics adapted from DeepSeek Harness ui-conversation (MIT).
import { DecoratorNode, TextNode, type NodeKey, type SerializedLexicalNode, type SerializedTextNode, type EditorConfig } from "lexical";
import type { ReactNode } from "react";
import { File, Folder } from "lucide-react";

type FileJSON = SerializedLexicalNode & { reference: string; folder: boolean };
export class FileReferenceNode extends DecoratorNode<ReactNode> {
  __reference: string; __folder: boolean;
  static getType() { return "lxe-file-reference"; }
  static clone(node: FileReferenceNode) { return new FileReferenceNode(node.__reference, node.__folder, node.__key); }
  constructor(reference: string, folder: boolean, key?: NodeKey) { super(key); this.__reference = reference; this.__folder = folder; }
  static importJSON(value: FileJSON) { return new FileReferenceNode(value.reference, value.folder); }
  exportJSON(): FileJSON { return { ...super.exportJSON(), type: FileReferenceNode.getType(), version: 1, reference: this.__reference, folder: this.__folder }; }
  getTextContent() { return this.__reference; }
  isInline() { return true; }
  isKeyboardSelectable() { return true; }
  createDOM() { const el = document.createElement("span"); el.className = "composer-file-reference"; return el; }
  updateDOM() { return false; }
  decorate() {
    const path = this.__reference.slice(1).replace(/^"|"$/g, "");
    const Icon = this.__folder ? Folder : File;
    return <span data-file-reference={path} data-folder={this.__folder} title={path} className="composer-reference-chip"><Icon size={14} /><span>{path.split(/[\\/]/).filter(Boolean).at(-1)}{this.__folder ? "/" : ""}</span></span>;
  }
}

export class SkillReferenceNode extends TextNode {
  static getType() { return "lxe-skill-reference"; }
  static clone(node: SkillReferenceNode) { return new SkillReferenceNode(node.__text, node.__key); }
  static importJSON(value: SerializedTextNode) { return new SkillReferenceNode(value.text).updateFromJSON(value); }
  exportJSON(): SerializedTextNode { return { ...super.exportJSON(), type: SkillReferenceNode.getType() }; }
  createDOM(config: EditorConfig) { const el = super.createDOM(config); el.classList.add("composer-skill-reference"); el.dataset.skillReference = "true"; return el; }
  isTextEntity() { return true; }
  canInsertTextBefore() { return true; }
}
