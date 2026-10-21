import React from 'react'
import ReactMarkdown from 'react-markdown'
import rehypeRaw from 'rehype-raw'
import remarkGfm from 'remark-gfm'

interface MarkdownRendererProps {
  content: string
}

export default function MarkdownRenderer({ content }: MarkdownRendererProps) {
  return (
    <div className="max-w-none">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[rehypeRaw]}
        components={{
          h1: ({ node, ...props }) => <h1 className="mb-6 text-3xl font-display font-bold text-brand" {...props} />,
          h2: ({ node, ...props }) => <h2 className="mb-4 mt-8 text-xl font-bold text-foreground" {...props} />,
          h3: ({ node, ...props }) => <h3 className="mb-3 mt-6 text-lg font-bold text-foreground" {...props} />,
          p: ({ node, ...props }) => <p className="mb-4 leading-relaxed text-muted-foreground" {...props} />,
          a: ({ node, ...props }) => <a className="text-brand hover:underline focus-visible:underline" {...props} />,
          ul: ({ node, ...props }) => <ul className="mb-4 list-inside list-disc space-y-2 text-muted-foreground" {...props} />,
          ol: ({ node, ...props }) => <ol className="mb-4 list-inside list-decimal space-y-2 text-muted-foreground" {...props} />,
          li: ({ node, ...props }) => <li className="text-muted-foreground" {...props} />,
          strong: ({ node, ...props }) => <strong className="font-semibold text-foreground" {...props} />,
          blockquote: ({ node, ...props }) => <blockquote className="my-4 border-l-4 border-brand pl-4 italic text-muted-foreground" {...props} />,
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  )
}
