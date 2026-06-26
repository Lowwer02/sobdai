export interface ParsedQuestion {
  content: string;
  choice_a: string;
  choice_b: string;
  choice_c: string;
  choice_d: string;
  correct_answer: string;
  hint: string;
  full_explanation: string;
  why_a_wrong: string;
  why_b_wrong: string;
  why_c_wrong: string;
  why_d_wrong: string;
  reference: string;
  difficulty: 'Easy' | 'Medium' | 'Hard';
  category: string;
  subject: string;
  law: string;
  topic: string;
  tags: string[];
}

export interface ParseResult {
  data: ParsedQuestion | null;
  isValid: boolean;
  errors: string[];
  rawText: string;
  index: number;
}

/**
 * Extracts the value following a specific prefix from a chunk of text.
 * Handles multiline values until the next strong label or end of chunk.
 */
function extractField(chunk: string, regexPattern: RegExp): string {
  const match = chunk.match(regexPattern);
  if (!match) return '';
  return match[1].trim();
}

/**
 * Parse a full markdown file containing multiple questions separated by '---'
 */
export function parseMarkdownQuestions(markdown: string): ParseResult[] {
  // Split by horizontal rule '---' or '***' ensuring it's on its own line
  const chunks = markdown.split(/\n\s*---\s*\n|\n\s*\*\*\*\s*\n/);
  
  const results: ParseResult[] = [];

  chunks.forEach((rawChunk, index) => {
    const chunk = rawChunk.trim();
    if (!chunk) return; // Skip empty chunks

    const errors: string[] = [];

    // Extracting fields using regex
    // The format expects labels like **Question:**, A., B., C., D., **Answer:**
    
    // We use a strategy where we match everything after a label until the next label or EOF
    const extractMultiline = (labelRegex: string) => {
      // Lookbehind for the label, match anything non-greedy until the next known label or end of string
      const regex = new RegExp(`${labelRegex}\\s*([\\s\\S]*?)(?=\\n\\s*(?:A\\.|B\\.|C\\.|D\\.|\\*\\*Question:\\*\\*|\\*\\*Answer:\\*\\*|\\*\\*Hint:\\*\\*|\\*\\*Explanation:\\*\\*|\\*\\*Why A Wrong:\\*\\*|\\*\\*Why B Wrong:\\*\\*|\\*\\*Why C Wrong:\\*\\*|\\*\\*Why D Wrong:\\*\\*|\\*\\*Reference:\\*\\*|\\*\\*Difficulty:\\*\\*|\\*\\*Category:\\*\\*|\\*\\*Subject:\\*\\*|\\*\\*Law:\\*\\*|\\*\\*Topic:\\*\\*|\\*\\*Tags:\\*\\*)|$)`, 'i');
      return extractField(chunk, regex);
    };

    const content = extractMultiline('\\*\\*Question:\\*\\*');
    const choice_a = extractMultiline('A\\.');
    const choice_b = extractMultiline('B\\.');
    const choice_c = extractMultiline('C\\.');
    const choice_d = extractMultiline('D\\.');
    
    const correct_answer_raw = extractMultiline('\\*\\*Answer:\\*\\*').toUpperCase().charAt(0);
    const hint = extractMultiline('\\*\\*Hint:\\*\\*');
    const full_explanation = extractMultiline('\\*\\*Explanation:\\*\\*');
    const why_a_wrong = extractMultiline('\\*\\*Why A Wrong:\\*\\*');
    const why_b_wrong = extractMultiline('\\*\\*Why B Wrong:\\*\\*');
    const why_c_wrong = extractMultiline('\\*\\*Why C Wrong:\\*\\*');
    const why_d_wrong = extractMultiline('\\*\\*Why D Wrong:\\*\\*');
    const reference = extractMultiline('\\*\\*Reference:\\*\\*');
    
    const difficultyRaw = extractMultiline('\\*\\*Difficulty:\\*\\*');
    const category = extractMultiline('\\*\\*Category:\\*\\*');
    const subject = extractMultiline('\\*\\*Subject:\\*\\*');
    const law = extractMultiline('\\*\\*Law:\\*\\*');
    const topic = extractMultiline('\\*\\*Topic:\\*\\*');
    const tagsRaw = extractMultiline('\\*\\*Tags:\\*\\*');

    // Default formatting and validation
    if (!content) errors.push('Missing **Question:** field');
    if (!choice_a) errors.push('Missing Choice A.');
    if (!choice_b) errors.push('Missing Choice B.');
    if (!choice_c) errors.push('Missing Choice C.');
    if (!choice_d) errors.push('Missing Choice D.');

    let correct_answer = correct_answer_raw;
    if (!['A', 'B', 'C', 'D'].includes(correct_answer)) {
      errors.push('Correct answer must be A, B, C, or D');
      correct_answer = 'A'; // fallback to prevent type error, validity is false anyway
    }

    let difficulty: 'Easy' | 'Medium' | 'Hard' = 'Medium';
    if (difficultyRaw.toLowerCase().includes('easy')) difficulty = 'Easy';
    else if (difficultyRaw.toLowerCase().includes('hard')) difficulty = 'Hard';
    else if (difficultyRaw.toLowerCase().includes('medium')) difficulty = 'Medium';
    // If empty or unrecognized, defaults to Medium

    const tags = tagsRaw ? tagsRaw.split(',').map(t => t.trim()).filter(Boolean) : [];

    const isValid = errors.length === 0;

    const data: ParsedQuestion | null = isValid ? {
      content,
      choice_a,
      choice_b,
      choice_c,
      choice_d,
      correct_answer,
      hint,
      full_explanation,
      why_a_wrong,
      why_b_wrong,
      why_c_wrong,
      why_d_wrong,
      reference,
      difficulty,
      category,
      subject,
      law,
      topic,
      tags
    } : null;

    results.push({
      data,
      isValid,
      errors,
      rawText: chunk,
      index: index + 1
    });
  });

  return results;
}
