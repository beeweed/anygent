"use client";

import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import hljs from "highlight.js/lib/common";
import { useEffect, useRef } from "react";

interface Props {
  text: string;
}

export function MessageMarkdown({ text }: Props) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!ref.current) return;
    const blocks = ref.current.querySelectorAll<HTMLElement>("pre code");
    blocks.forEach((b) => {
      if (b.dataset.hljs === "1") return;
      try {
        hljs.highlightElement(b);
        b.dataset.hljs = "1";
      } catch {
        /* ignore */
      }
    });
  }, [text]);

  return (
    <div ref={ref} className="markdown">
      <ReactMarkdown remarkPlugins={[remarkGfm]}>{text}</ReactMarkdown>
    </div>
  );
}
