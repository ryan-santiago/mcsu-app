"use client";

import Link from "@tiptap/extension-link";
import Placeholder from "@tiptap/extension-placeholder";
import { EditorContent, useEditor, type Editor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import {
  Bold,
  Code,
  Heading1,
  Heading2,
  Heading3,
  Italic,
  Link as LinkIcon,
  List,
  ListOrdered,
  Pilcrow,
  Quote,
  Redo2,
  SquareCode,
  Strikethrough,
  Undo2,
  Unlink,
} from "lucide-react";
import * as React from "react";

import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

/**
 * Shared with anywhere else that renders saved description HTML read-only
 * (`dangerouslySetInnerHTML`) — keeps the two in visual sync without a CSS
 * dependency like `@tailwindcss/typography`, which isn't installed here.
 */
export const RICH_TEXT_CONTENT_CLASSNAME = cn(
  "text-sm leading-relaxed",
  "[&_p]:my-1.5 first:[&_p]:mt-0 last:[&_p]:mb-0",
  "[&_h1]:mt-3 [&_h1]:mb-1.5 [&_h1]:text-lg [&_h1]:font-semibold",
  "[&_h2]:mt-3 [&_h2]:mb-1.5 [&_h2]:text-base [&_h2]:font-semibold",
  "[&_h3]:mt-2 [&_h3]:mb-1 [&_h3]:text-sm [&_h3]:font-semibold",
  "[&_ul]:my-1.5 [&_ul]:list-disc [&_ul]:pl-5",
  "[&_ol]:my-1.5 [&_ol]:list-decimal [&_ol]:pl-5",
  "[&_li]:my-0.5",
  "[&_blockquote]:border-muted-foreground/30 [&_blockquote]:text-muted-foreground [&_blockquote]:my-1.5 [&_blockquote]:border-l-2 [&_blockquote]:pl-3",
  "[&_code]:bg-muted [&_code]:rounded [&_code]:px-1 [&_code]:py-0.5 [&_code]:font-mono [&_code]:text-[0.85em]",
  "[&_pre]:bg-muted [&_pre]:my-1.5 [&_pre]:overflow-x-auto [&_pre]:rounded-md [&_pre]:p-2.5 [&_pre]:font-mono [&_pre]:text-[0.85em] [&_pre_code]:bg-transparent [&_pre_code]:p-0",
  "[&_hr]:border-border [&_hr]:my-3",
  "[&_a]:text-brand [&_a]:underline [&_a]:underline-offset-2",
);

type RichTextEditorProps = {
  value: string;
  onChange: (html: string) => void;
  onBlur?: () => void;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
};

/**
 * A Tiptap-based rich text editor with a JIRA-style formatting toolbar.
 * `value` seeds the editor's *initial* content only — Tiptap owns its own
 * document state after that, so typing doesn't fight a controlled-input
 * re-render on every keystroke. Callers that need to reset the content
 * (switching to a different record) should remount this component with a
 * `key`, the same convention `WorkItemDetailSheet` already uses.
 */
export function RichTextEditor({ value, onChange, onBlur, placeholder, disabled, className }: RichTextEditorProps) {
  const editor = useEditor({
    extensions: [
      StarterKit.configure({ heading: { levels: [1, 2, 3] } }),
      Link.configure({
        openOnClick: false,
        autolink: true,
        HTMLAttributes: { rel: "noopener noreferrer", target: "_blank" },
      }),
      Placeholder.configure({ placeholder: placeholder ?? "Add a description..." }),
    ],
    content: value,
    editable: !disabled,
    immediatelyRender: false,
    // Tiptap's "empty" document still serializes to "<p></p>", not "" — treat
    // it as no description so downstream empty-checks (`?? ""` fallbacks,
    // zod's `z.literal("")` branch) keep working the same as before.
    onUpdate: ({ editor }) => onChange(editor.isEmpty ? "" : editor.getHTML()),
    onBlur: () => onBlur?.(),
    editorProps: {
      attributes: {
        class: cn(RICH_TEXT_CONTENT_CLASSNAME, "min-h-24 px-3 py-2 focus:outline-none"),
      },
    },
  });

  return (
    <div className={cn("rounded-md border", disabled && "bg-muted/30", className)}>
      {!disabled ? <RichTextToolbar editor={editor} /> : null}
      <EditorContent editor={editor} />
    </div>
  );
}

function RichTextToolbar({ editor }: { editor: Editor | null }) {
  const [linkOpen, setLinkOpen] = React.useState(false);
  const [linkUrl, setLinkUrl] = React.useState("");

  if (!editor) return null;

  const activeHeading = ([1, 2, 3] as const).find((level) => editor.isActive("heading", { level }));

  function openLinkPopover() {
    setLinkUrl(editor!.getAttributes("link").href ?? "");
    setLinkOpen(true);
  }

  function applyLink() {
    const url = linkUrl.trim();
    if (url) {
      editor!.chain().focus().extendMarkRange("link").setLink({ href: url }).run();
    } else {
      editor!.chain().focus().extendMarkRange("link").unsetLink().run();
    }
    setLinkOpen(false);
  }

  return (
    <div className="flex flex-wrap items-center gap-0.5 border-b p-1">
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button type="button" variant="ghost" size="icon-sm" aria-label="Text style">
            {activeHeading === 1 ? <Heading1 className="size-4" aria-hidden /> : null}
            {activeHeading === 2 ? <Heading2 className="size-4" aria-hidden /> : null}
            {activeHeading === 3 ? <Heading3 className="size-4" aria-hidden /> : null}
            {!activeHeading ? <Pilcrow className="size-4" aria-hidden /> : null}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start">
          <DropdownMenuItem onSelect={() => editor.chain().focus().setParagraph().run()}>
            <Pilcrow className="size-4" aria-hidden />
            Paragraph
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}>
            <Heading1 className="size-4" aria-hidden />
            Heading 1
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}>
            <Heading2 className="size-4" aria-hidden />
            Heading 2
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}>
            <Heading3 className="size-4" aria-hidden />
            Heading 3
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <ToolbarDivider />

      <ToolbarToggle
        label="Bold"
        icon={Bold}
        active={editor.isActive("bold")}
        onClick={() => editor.chain().focus().toggleBold().run()}
      />
      <ToolbarToggle
        label="Italic"
        icon={Italic}
        active={editor.isActive("italic")}
        onClick={() => editor.chain().focus().toggleItalic().run()}
      />
      <ToolbarToggle
        label="Strikethrough"
        icon={Strikethrough}
        active={editor.isActive("strike")}
        onClick={() => editor.chain().focus().toggleStrike().run()}
      />
      <ToolbarToggle
        label="Inline code"
        icon={Code}
        active={editor.isActive("code")}
        onClick={() => editor.chain().focus().toggleCode().run()}
      />

      <ToolbarDivider />

      <ToolbarToggle
        label="Bullet list"
        icon={List}
        active={editor.isActive("bulletList")}
        onClick={() => editor.chain().focus().toggleBulletList().run()}
      />
      <ToolbarToggle
        label="Numbered list"
        icon={ListOrdered}
        active={editor.isActive("orderedList")}
        onClick={() => editor.chain().focus().toggleOrderedList().run()}
      />
      <ToolbarToggle
        label="Quote"
        icon={Quote}
        active={editor.isActive("blockquote")}
        onClick={() => editor.chain().focus().toggleBlockquote().run()}
      />
      <ToolbarToggle
        label="Code block"
        icon={SquareCode}
        active={editor.isActive("codeBlock")}
        onClick={() => editor.chain().focus().toggleCodeBlock().run()}
      />

      <ToolbarDivider />

      <Popover open={linkOpen} onOpenChange={setLinkOpen}>
        <PopoverTrigger asChild>
          <Button
            type="button"
            variant={editor.isActive("link") ? "secondary" : "ghost"}
            size="icon-sm"
            aria-label="Link"
            aria-pressed={editor.isActive("link")}
            onClick={openLinkPopover}
          >
            <LinkIcon className="size-4" aria-hidden />
          </Button>
        </PopoverTrigger>
        <PopoverContent align="start" className="w-72">
          <div className="flex items-center gap-1.5">
            <Input
              autoFocus
              value={linkUrl}
              onChange={(event) => setLinkUrl(event.target.value)}
              placeholder="https://…"
              className="h-8"
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  applyLink();
                }
              }}
            />
            <Button type="button" size="sm" onClick={applyLink}>
              Apply
            </Button>
            {editor.isActive("link") ? (
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                aria-label="Remove link"
                onClick={() => {
                  editor.chain().focus().extendMarkRange("link").unsetLink().run();
                  setLinkOpen(false);
                }}
              >
                <Unlink className="size-4" aria-hidden />
              </Button>
            ) : null}
          </div>
        </PopoverContent>
      </Popover>

      <ToolbarDivider />

      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        aria-label="Undo"
        disabled={!editor.can().undo()}
        onClick={() => editor.chain().focus().undo().run()}
      >
        <Undo2 className="size-4" aria-hidden />
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        aria-label="Redo"
        disabled={!editor.can().redo()}
        onClick={() => editor.chain().focus().redo().run()}
      >
        <Redo2 className="size-4" aria-hidden />
      </Button>
    </div>
  );
}

function ToolbarToggle({
  label,
  icon: Icon,
  active,
  onClick,
}: {
  label: string;
  icon: React.ComponentType<{ className?: string; "aria-hidden"?: boolean }>;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <Button
      type="button"
      variant={active ? "secondary" : "ghost"}
      size="icon-sm"
      aria-label={label}
      aria-pressed={active}
      onClick={onClick}
    >
      <Icon className="size-4" aria-hidden />
    </Button>
  );
}

function ToolbarDivider() {
  return <div className="bg-border mx-0.5 h-5 w-px shrink-0" aria-hidden />;
}
