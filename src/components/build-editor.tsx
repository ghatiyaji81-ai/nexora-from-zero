'use client';

import React from 'react';

export interface BuildEditorProps {
  path: string;
  content: string;
  isArchived: boolean;
  onChange: (value: string) => void;
  textareaRef?: React.RefObject<HTMLTextAreaElement | null>;
}

export function BuildEditor({
  path,
  content,
  isArchived,
  onChange,
  textareaRef,
}: BuildEditorProps) {
  const lineCount = Math.max(1, content.split('\n').length);
  const lineNumbers = Array.from({ length: lineCount }, (_, index) => index + 1).join('\n');

  return (
    <div className="build-code-editor" data-editor-path={path}>
      <pre className="build-line-numbers" aria-hidden="true">
        {lineNumbers}
      </pre>
      <textarea
        ref={textareaRef}
        aria-label={`Code editor: ${path}`}
        spellCheck={false}
        autoCapitalize="off"
        autoCorrect="off"
        readOnly={isArchived}
        value={content}
        onChange={(event) => onChange(event.target.value)}
      />
    </div>
  );
}
