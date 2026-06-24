const fs = require('fs');

const mdContent = fs.readFileSync('../สป.อว./แบบทดสอบเตรียมสอบ สป. อว. นักวิเคราะห์นโยบายและแผนปฏิบัติการ หัวข้อ พ.ร.บ. แผนด้านการอุ.md', 'utf-8');

const lines = mdContent.split('\n');
const questions = [];
let currentQ = null;

const answerMap = {};
let parsingAnswers = false;
let currentAnsNum = null;

for (let i = 0; i < lines.length; i++) {
  let line = lines[i].trim();
  line = line.replace(/\\\*/g, '*');
  line = line.replace(/\\\./g, '.');
  
  if (line === '### เฉลยและคำอธิบายอย่างละเอียด') {
    parsingAnswers = true;
    continue;
  }
  
  if (parsingAnswers) {
    // Match: **1. เฉลย ข.** ...
    const match = line.match(/^\*\*(\d+)\.\s+เฉลย\s+([กขคง])\.\*\*\s+(.*)$/);
    if (match) {
      currentAnsNum = parseInt(match[1]);
      let correctChoice = match[2];
      const map = {'ก': 'a', 'ข': 'b', 'ค': 'c', 'ง': 'd'};
      answerMap[currentAnsNum] = {
        correct_answer: map[correctChoice],
        why_correct: '',
        why_wrong: ''
      };
    } else if (currentAnsNum && line.startsWith('- **ทำไมถึงถูก:**')) {
      answerMap[currentAnsNum].why_correct = line.replace('- **ทำไมถึงถูก:**', '').trim();
    } else if (currentAnsNum && line.startsWith('- **ทำไมช้อยส์อื่นผิด:**')) {
      answerMap[currentAnsNum].why_wrong = line.replace('- **ทำไมช้อยส์อื่นผิด:**', '').trim();
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
        hint: ''
      };
      questions.push(currentQ);
    } else if (currentQ) {
      if (line.startsWith('ก. ')) currentQ.choice_a = line.substring(3).trim();
      else if (line.startsWith('ข. ')) currentQ.choice_b = line.substring(3).trim();
      else if (line.startsWith('ค. ')) currentQ.choice_c = line.substring(3).trim();
      else if (line.startsWith('ง. ')) currentQ.choice_d = line.substring(3).trim();
      else if (line.startsWith('> 💡 **คำใบ้:**')) currentQ.hint = line.replace('> 💡 **คำใบ้:**', '').trim();
    }
  }
}

for (let q of questions) {
  const ans = answerMap[q.question_number];
  if (ans) {
    q.correct_answer = ans.correct_answer;
    
    // Combining explanations
    let explanationText = '';
    if (ans.why_correct) explanationText += `✅ **ทำไมถึงถูก:** ${ans.why_correct}`;
    if (ans.why_wrong) explanationText += `\n❌ **ทำไมช้อยส์อื่นผิด:** ${ans.why_wrong}`;
    
    // Escape single and double quotes just in case, though stringify handles double quotes.
    q.explanation = explanationText;
  }
}

const tsContent = `// ข้อสอบ Demo สำหรับทดสอบ (จากไฟล์ สป.อว.)\nimport type { Question } from '@/lib/types'\n\nexport const DEMO_QUESTIONS: Partial<Question>[] = ${JSON.stringify(questions, null, 2)};\n`;

fs.writeFileSync('./lib/demo_questions.ts', tsContent);
console.log('Parsed ' + questions.length + ' questions successfully!');
