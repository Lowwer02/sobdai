const fs = require('fs');

const mdContent = fs.readFileSync('../สป.อว./แบบทดสอบเตรียมสอบ สป. อว. นักวิเคราะห์นโยบายและแผนปฏิบัติการ หัวข้อ พ.ร.บ. แผนด้านการอุ.md', 'utf-8');

const lines = mdContent.split('\n');
const questions = [];
let currentQ = null;

const answerMap = {};
let parsingAnswers = false;

for (let line of lines) {
  line = line.trim();
  // Remove backslashes before asterisks
  line = line.replace(/\\\*/g, '*');
  line = line.replace(/\\\./g, '.');
  
  if (line === '### เฉลยและคำอธิบาย') {
    parsingAnswers = true;
    continue;
  }
  
  if (parsingAnswers) {
    // 1. **เฉลย ข.** ...
    const match = line.match(/^(\d+)\.\s+\*\*เฉลย\s+([กขคง])\.\*\*\s+(.*)$/);
    if (match) {
      const qNum = parseInt(match[1]);
      let correctChoice = match[2];
      const explanation = match[3];
      
      const map = {'ก': 'a', 'ข': 'b', 'ค': 'c', 'ง': 'd'};
      answerMap[qNum] = {
        correct_answer: map[correctChoice],
        explanation: explanation
      };
    }
  } else {
    // **1. วิสัยทัศน์ของแผนด้านการอุดมศึกษา ฉบับปรับปรุง พ.ศ.2566-2570 คือข้อใด?**
    const qMatch = line.match(/^\*\*(\d+)\.\s+(.*?)\*\*$/);
    if (qMatch) {
      currentQ = {
        id: `d${qMatch[1]}`,
        exam_id: 'demo-1',
        question_number: parseInt(qMatch[1]),
        question_text: qMatch[2],
        choice_a: '',
        choice_b: '',
        choice_c: '',
        choice_d: '',
        difficulty: 1, // default
      };
      questions.push(currentQ);
    } else if (currentQ) {
      if (line.startsWith('ก. ')) currentQ.choice_a = line.substring(3).trim();
      else if (line.startsWith('ข. ')) currentQ.choice_b = line.substring(3).trim();
      else if (line.startsWith('ค. ')) currentQ.choice_c = line.substring(3).trim();
      else if (line.startsWith('ง. ')) currentQ.choice_d = line.substring(3).trim();
    }
  }
}

for (let q of questions) {
  const ans = answerMap[q.question_number];
  if (ans) {
    q.correct_answer = ans.correct_answer;
    q.explanation = ans.explanation;
    q.hint = `ลองทบทวนเรื่อง "${q.question_text.split(' ').slice(0, 5).join(' ')}..." ดูอีกรอบ`;
  }
}

const tsContent = `// ข้อสอบ Demo สำหรับทดสอบ (จากไฟล์ สป.อว.)\nimport type { Question } from '@/lib/types'\n\nexport const DEMO_QUESTIONS: Partial<Question>[] = ${JSON.stringify(questions, null, 2)};\n`;

fs.writeFileSync('./demo_questions.ts', tsContent);
console.log('Parsed ' + questions.length + ' questions successfully!');
