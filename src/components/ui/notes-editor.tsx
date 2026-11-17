"use client";

import TaskItem from "@tiptap/extension-task-item";
import TaskList from "@tiptap/extension-task-list";
import Placeholder from "@tiptap/extension-placeholder";
import { EditorContent, useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";

import { Icon, type IconName } from "@/components/icons/icon";
import { cn } from "@/lib/utils/cn";
import { IconButton } from "./icon-button";

export interface NotesEditorProps {
  /** Initial HTML content. */
  content?: string;
  onChange?: (html: string) => void;
  editable?: boolean;
  placeholder?: string;
  className?: string;
  ariaLabel?: string;
}

interface ToolbarItem {
  label: string;
  icon: IconName;
  active: boolean;
  run: () => void;
}

/**
 * A small rich-text editor with checklists, used by the Notes feature and the
 * composer. Built on TipTap/ProseMirror; renders nothing on the server to avoid
 * an SSR hydration mismatch.
 */
export function NotesEditor({
  content = "",
  onChange,
  editable = true,
  placeholder = "Write a note…",
  className,
  ariaLabel = "Note",
}: NotesEditorProps) {
  const editor = useEditor({
    extensions: [
      StarterKit,
      TaskList,
      TaskItem.configure({ nested: true }),
      Placeholder.configure({ placeholder }),
    ],
    content,
    editable,
    immediatelyRender: false,
    editorProps: {
      attributes: {
        class: "tiptap min-h-48 focus:outline-none",
        "aria-label": ariaLabel,
        role: "textbox",
        "aria-multiline": "true",
      },
    },
    onUpdate: ({ editor: instance }) => {
      onChange?.(instance.getHTML());
    },
  });

  if (!editor) return null;

  const toolbar: ToolbarItem[] = [
    {
      label: "Bold",
      icon: "bold",
      active: editor.isActive("bold"),
      run: () => {
        editor.chain().focus().toggleBold().run();
      },
    },
    {
      label: "Italic",
      icon: "italic",
      active: editor.isActive("italic"),
      run: () => {
        editor.chain().focus().toggleItalic().run();
      },
    },
    {
      label: "Bullet list",
      icon: "list",
      active: editor.isActive("bulletList"),
      run: () => {
        editor.chain().focus().toggleBulletList().run();
      },
    },
    {
      label: "Checklist",
      icon: "check-circle",
      active: editor.isActive("taskList"),
      run: () => {
        editor.chain().focus().toggleTaskList().run();
      },
    },
    {
      label: "Undo",
      icon: "arrow-left",
      active: false,
      run: () => {
        editor.chain().focus().undo().run();
      },
    },
    {
      label: "Redo",
      icon: "arrow-right",
      active: false,
      run: () => {
        editor.chain().focus().redo().run();
      },
    },
  ];

  return (
    <div className={cn("overflow-hidden rounded-xl border border-border bg-surface", className)}>
      {editable ? (
        <div
          role="toolbar"
          aria-label="Formatting"
          className="flex flex-wrap items-center gap-1 border-b border-border bg-surface-2 p-1.5"
        >
          {toolbar.map((item) => (
            <IconButton
              key={item.label}
              label={item.label}
              size="sm"
              aria-pressed={item.active}
              onClick={item.run}
              className={cn(item.active && "bg-accent-soft text-accent")}
            >
              <Icon name={item.icon} size={16} />
            </IconButton>
          ))}
        </div>
      ) : null}
      <EditorContent editor={editor} className="px-4 py-3 text-sm text-foreground" />
    </div>
  );
}
