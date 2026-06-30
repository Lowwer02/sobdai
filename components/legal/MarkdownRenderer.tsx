import React from 'react'
import ReactMarkdown from 'react-markdown'
import rehypeRaw from 'rehype-raw'
import remarkGfm from 'remark-gfm'

interface MarkdownRendererProps {
  content: string
}

export default function MarkdownRenderer({ content }: MarkdownRendererProps) {
  return (
    <div className="prose prose-invert prose-gold max-w-none">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[rehypeRaw]}
        components={{
          h1: ({ node, ...props }) => <h1 className="text-3xl font-display font-bold text-[#D4AF37] mb-6" {...props} />,
          h2: ({ node, ...props }) => <h2 className="text-xl font-bold text-[#F5E9D6] mt-8 mb-4" {...props} />,
          h3: ({ node, ...props }) => <h3 className="text-lg font-bold text-[#F5E9D6] mt-6 mb-3" {...props} />,
          p: ({ node, ...props }) => <p className="text-[#A1866B] leading-relaxed mb-4" {...props} />,
          a: ({ node, ...props }) => <a className="text-[#D4AF37] hover:underline" {...props} />,
          ul: ({ node, ...props }) => <ul className="list-disc list-inside text-[#A1866B] mb-4 space-y-2" {...props} />,
          ol: ({ node, ...props }) => <ol className="list-decimal list-inside text-[#A1866B] mb-4 space-y-2" {...props} />,
          li: ({ node, ...props }) => <li className="text-[#A1866B]" {...props} />,
          strong: ({ node, ...props }) => <strong className="text-[#F5E9D6] font-semibold" {...props} />,
          blockquote: ({ node, ...props }) => <blockquote className="border-l-4 border-[#D4AF37] pl-4 italic text-[#A1866B]/80 my-4" {...props} />,
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  )
}
