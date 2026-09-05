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
  document: string;
  document_type: string;
  // Document Code Intake V1 (Content Template v2.1 Part 3). Empty string when
  // the authored content doesn't carry the label (legacy content); the
  // importer converts empty → NULL on insert. The value is preserved exactly
  // (outer whitespace trimmed only) — never uppercased, rewritten, or derived
  // from the Document name.
  document_code: string;
  topic: string;
  learning_objective: string;
  knowledge_coverage: string;
  blueprint: string;
  question_type: string;
  choice_count: string;
  law: string;
  tags: string[];
  // IG-2 axes (Content Template v2.2 — Session 6.19.2). Empty string when the
  // authored content doesn't carry the label (v2.1 content); the importer
  // converts empty → NULL on insert. Vocabulary per Blueprint v3.0.
  question_pattern: string;
  section: string;
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
 * Conservative machine-code format for **DocumentCode:** (Document Code
 * Intake V1): uppercase ASCII letters, digits, and hyphens — e.g.
 * DOC-ACT-STATE-ADMIN-2534, DOC-OAG-ORGANIC-ACT-2561. No leading/trailing
 * hyphen, no empty segments, no other characters. The code is an opaque
 * identity: the parser never derives, rewrites, or normalizes it.
 */
export const DOCUMENT_CODE_PATTERN = /^[A-Z0-9]+(?:-[A-Z0-9]+)*$/

export function isValidDocumentCode(value: string): boolean {
  return DOCUMENT_CODE_PATTERN.test(value)
}

/**
 * Parse a full markdown file containing multiple questions separated by '---'
 */
export function parseMarkdownQuestions(markdown: string): ParseResult[] {
  // Split by horizontal rule '---' or '***' ensuring it's on its own line
  const chunks = markdown.split(/\n\s*---\s*\n|\n\s*\*\*\*\s*\n/);

  const results: ParseResult[] = [];

  // Complete list of known labels used as boundaries in the lookahead.
  // Adding every Content Template v2.1 label here is what stops a field from
  // greedily swallowing the next field's value (the root cause of the bug
  // where Document leaked into Subject, and LearningObjective/KnowledgeCoverage
  // leaked into Topic).
  const KNOWN_LABELS = [
    'A\\.', 'B\\.', 'C\\.', 'D\\.', 'E\\.',
    '\\*\\*Question:\\*\\*',
    '\\*\\*Answer:\\*\\*',
    '\\*\\*Hint:\\*\\*',
    '\\*\\*Explanation:\\*\\*',
    '\\*\\*Why A Wrong:\\*\\*',
    '\\*\\*Why B Wrong:\\*\\*',
    '\\*\\*Why C Wrong:\\*\\*',
    '\\*\\*Why D Wrong:\\*\\*',
    '\\*\\*Why E Wrong:\\*\\*',
    '\\*\\*Reference:\\*\\*',
    '\\*\\*Difficulty:\\*\\*',
    '\\*\\*Blueprint:\\*\\*',
    '\\*\\*QuestionPattern:\\*\\*',
    '\\*\\*Section:\\*\\*',
    '\\*\\*QuestionType:\\*\\*',
    '\\*\\*ChoiceCount:\\*\\*',
    '\\*\\*Category:\\*\\*',
    '\\*\\*Subject:\\*\\*',
    '\\*\\*DocumentCode:\\*\\*',
    '\\*\\*Document:\\*\\*',
    '\\*\\*DocumentType:\\*\\*',
    '\\*\\*Law:\\*\\*',
    '\\*\\*Topic:\\*\\*',
    '\\*\\*LearningObjective:\\*\\*',
    '\\*\\*KnowledgeCoverage:\\*\\*',
    '\\*\\*Tags:\\*\\*',
  ].join('|');

  chunks.forEach((rawChunk, index) => {
    const chunk = rawChunk.trim();
    if (!chunk) return; // Skip empty chunks

    const errors: string[] = [];

    // Match everything after a label, non-greedy, until the next known label
    // or end of chunk. Each field is parsed independently with the full
    // boundary list so values never bleed across fields.
    const extractMultiline = (labelRegex: string) => {
      const regex = new RegExp(`${labelRegex}\\s*([\\s\\S]*?)(?=\\n\\s*(?:${KNOWN_LABELS})|$)`, 'i');
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
    const document = extractMultiline('\\*\\*Document:\\*\\*');
    const document_type = extractMultiline('\\*\\*DocumentType:\\*\\*');
    // Document Code Intake V1: the shared KNOWN_LABELS boundary list includes
    // **DocumentCode:** so Document and DocumentCode never swallow each other
    // regardless of the order they appear in.
    const document_code = extractMultiline('\\*\\*DocumentCode:\\*\\*');
    const law = extractMultiline('\\*\\*Law:\\*\\*');
    const topic = extractMultiline('\\*\\*Topic:\\*\\*');
    const learning_objective = extractMultiline('\\*\\*LearningObjective:\\*\\*');
    const knowledge_coverage = extractMultiline('\\*\\*KnowledgeCoverage:\\*\\*');
    const blueprint = extractMultiline('\\*\\*Blueprint:\\*\\*');
    const question_type = extractMultiline('\\*\\*QuestionType:\\*\\*');
    const choice_count = extractMultiline('\\*\\*ChoiceCount:\\*\\*');
    // IG-2 axes (Content Template v2.2 §3 Patch B). Empty string when the
    // label is absent (v2.1 content) — backward compatible by design.
    const question_pattern = extractMultiline('\\*\\*QuestionPattern:\\*\\*');
    const section = extractMultiline('\\*\\*Section:\\*\\*');
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

    // Document Code Intake V1: when a DocumentCode is supplied it must match
    // the conservative machine-code format. A missing label stays allowed
    // (legacy files); a malformed value fails THIS question with a clear
    // field-level diagnostic. The value itself is never rewritten.
    if (document_code && !isValidDocumentCode(document_code)) {
      errors.push(
        `Invalid **DocumentCode:** format: "${document_code}" — use uppercase A–Z, digits 0–9, and hyphens only (e.g. DOC-ACT-STATE-ADMIN-2534)`
      );
    }

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
      document,
      document_type,
      document_code,
      law,
      topic,
      learning_objective,
      knowledge_coverage,
      blueprint,
      question_type,
      choice_count,
      tags,
      question_pattern,
      section
    } : null;

    results.push({
      data,
      isValid,
      errors,
      rawText: chunk,
      index: index + 1
    });
  });

  // Document Code Intake V1 — partial-file safety. A file where SOME questions
  // carry **DocumentCode:** and others omit it fails as a whole, so an
  // accidentally partially-coded import can't slip through. Legacy files with
  // NO codes at all pass unchanged, and questions in one file may legitimately
  // carry DIFFERENT codes (multi-document files are fine). Coded-ness is read
  // from the parsed value when the chunk parsed, otherwise from the raw chunk
  // text (invalid chunks have data: null).
  const coded = results.map((r) =>
    r.data ? r.data.document_code !== '' : /\*\*DocumentCode:\*\*/i.test(r.rawText)
  );
  if (coded.some(Boolean) && coded.some((c) => !c)) {
    results.forEach((r, i) => {
      r.isValid = false;
      r.data = null;
      r.errors.push(
        coded[i]
          ? 'Partially-coded file: other questions in this file are missing **DocumentCode:**. Add the missing codes or split the file.'
          : 'Partially-coded file: this question is missing **DocumentCode:** while other questions in the same file have one. Add it or split the file.'
      );
    });
  }

  return results;
}
