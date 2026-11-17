'use client';

import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Image from '@tiptap/extension-image';
import Placeholder from '@tiptap/extension-placeholder';
import { 
  Bold, 
  Italic, 
  Heading1, 
  Heading2, 
  Image as ImageIcon, 
  List, 
  ListOrdered, 
  Undo, 
  Redo 
} from 'lucide-react';

interface Props {
  content: any;
  onChange: (content: any) => void;
  placeholder?: string;
}

const MenuButton = ({ 
  onClick, 
  isActive = false, 
  children, 
  title 
}: { 
  onClick: () => void; 
  isActive?: boolean; 
  children: React.ReactNode;
  title: string;
}) => (
  <button
    onClick={(e) => {
      e.preventDefault();
      onClick();
    }}
    title={title}
    className={`p-2 rounded-lg transition-all ${
      isActive 
        ? 'bg-yellow-500 text-black shadow-lg shadow-yellow-500/20' 
        : 'hover:bg-white/10 text-gray-400 hover:text-white'
    }`}
  >
    {children}
  </button>
);

export function TiptapEditor({ content, onChange, placeholder }: Props) {
  const editor = useEditor({
    immediatelyRender: false,
    extensions: [
      StarterKit,
      Image.configure({
        HTMLAttributes: {
          class: 'rounded-xl border border-white/10 max-w-full h-auto my-4',
        },
      }),
      Placeholder.configure({
        placeholder: placeholder || 'Enter your story here...',
      }),
    ],
    content: content,
    onUpdate: ({ editor }) => {
      onChange(editor.getJSON());
    },
    editorProps: {
      attributes: {
        class: 'focus:outline-none min-h-[200px] p-4 text-gray-200 leading-relaxed prose prose-invert max-w-none',
      },
    },
  });

  if (!editor) return null;

  const addImage = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.onchange = (e: any) => {
      const file = e.target.files[0];
      if (file) {
        const reader = new FileReader();
        reader.onload = (readerEvent) => {
          const src = readerEvent.target?.result as string;
          editor.chain().focus().setImage({ src }).run();
        };
        reader.readAsDataURL(file);
      }
    };
    input.click();
  };

  return (
    <div className="glass overflow-hidden rounded-xl border border-white/10 flex flex-col">
      <div className="border-b border-white/10 bg-black/40 p-2 flex flex-wrap gap-1 sticky top-0 z-10 backdrop-blur-md">
        <MenuButton
          onClick={() => editor.chain().focus().toggleBold().run()}
          isActive={editor.isActive('bold')}
          title="Bold"
        >
          <Bold className="w-4 h-4" />
        </MenuButton>
        <MenuButton
          onClick={() => editor.chain().focus().toggleItalic().run()}
          isActive={editor.isActive('italic')}
          title="Italic"
        >
          <Italic className="w-4 h-4" />
        </MenuButton>
        
        <div className="w-px h-6 bg-white/10 mx-1 self-center" />

        <MenuButton
          onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}
          isActive={editor.isActive('heading', { level: 1 })}
          title="Heading 1"
        >
          <Heading1 className="w-4 h-4" />
        </MenuButton>
        <MenuButton
          onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
          isActive={editor.isActive('heading', { level: 2 })}
          title="Heading 2"
        >
          <Heading2 className="w-4 h-4" />
        </MenuButton>

        <div className="w-px h-6 bg-white/10 mx-1 self-center" />

        <MenuButton
          onClick={() => editor.chain().focus().toggleBulletList().run()}
          isActive={editor.isActive('bulletList')}
          title="Bullet List"
        >
          <List className="w-4 h-4" />
        </MenuButton>
        <MenuButton
          onClick={() => editor.chain().focus().toggleOrderedList().run()}
          isActive={editor.isActive('orderedList')}
          title="Ordered List"
        >
          <ListOrdered className="w-4 h-4" />
        </MenuButton>

        <div className="w-px h-6 bg-white/10 mx-1 self-center" />

        <MenuButton
          onClick={addImage}
          title="Insert Image"
        >
          <ImageIcon className="w-4 h-4" />
        </MenuButton>

        <div className="flex-1" />

        <MenuButton
          onClick={() => editor.chain().focus().undo().run()}
          title="Undo"
        >
          <Undo className="w-4 h-4" />
        </MenuButton>
        <MenuButton
          onClick={() => editor.chain().focus().redo().run()}
          title="Redo"
        >
          <Redo className="w-4 h-4" />
        </MenuButton>
      </div>

      <div className="flex-1 overflow-y-auto max-h-[400px] md:max-h-[500px] custom-scrollbar">
        <EditorContent editor={editor} />
      </div>
    </div>
  );
}
