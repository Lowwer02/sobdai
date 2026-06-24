const fs = require('fs');

const mdContent = fs.readFileSync('../สป.อว./แบบทดสอบสป. อว. นวค.นโยบายและแผน หัวข้อ กรอบนโยบายและยุทธศาสตร์ อววน..md', 'utf-8');

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
  line = line.replace(/\\\#/g, '#');
  
  if (line.includes('เฉลยและคำอธิบายอย่างละเอียด')) {
    parsingAnswers = true;
    continue;
  }
  
  if (parsingAnswers) {
    const match = line.match(/^(?:\*\*(\d+)\.\s+เฉลย\s+([กขคง])\.\*\*|(\d+)\.\s+\*\*เฉลย\s+([กขคง])\.\*\*)/);
    
    if (match) {
      currentAnsNum = parseInt(match[1] || match[3]);
      let correctChoice = match[2] || match[4];
      const map = {'ก': 'a', 'ข': 'b', 'ค': 'c', 'ง': 'd'};
      answerMap[currentAnsNum] = {
        correct_answer: map[correctChoice],
        why_correct: '',
        why_wrong: ''
      };
    } else if (currentAnsNum) {
      if (line.match(/^[\-\*]\s+\*\*ทำไมถึงถูก:\*\*/)) {
        answerMap[currentAnsNum].why_correct = line.replace(/^[\-\*]\s+\*\*ทำไมถึงถูก:\*\*/, '').trim();
      } else if (line.match(/^[\-\*]\s+\*\*ทำไมช้อยส์อื่นผิด:\*\*/)) {
        answerMap[currentAnsNum].why_wrong = line.replace(/^[\-\*]\s+\*\*ทำไมช้อยส์อื่นผิด:\*\*/, '').trim();
      }
    }
  } else {
    const qMatch = line.match(/^\*\*(\d+)\.\s+(.*?)\*\*$/);
    if (qMatch) {
      currentQ = {
        id: `d2_${qMatch[1]}`, 
        exam_id: 'demo-2', 
        question_number: parseInt(qMatch[1]),
        question_text: qMatch[2],
        choice_a: '',
        choice_b: '',
        choice_c: '',
        choice_d: '',
        difficulty: 1, 
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
    
    let explanationText = '';
    if (ans.why_correct) explanationText += `✅ **ทำไมถึงถูก:** ${ans.why_correct}`;
    if (ans.why_wrong) explanationText += `\n❌ **ทำไมช้อยส์อื่นผิด:** ${ans.why_wrong}`;
    
    q.explanation = explanationText;
  }
}

const tsContent = `// ข้อสอบ Demo สำหรับทดสอบ (จากไฟล์ สป.อว. อววน.)\nimport type { Question } from '@/lib/types'\n\nexport const DEMO_QUESTIONS_2: Partial<Question>[] = ${JSON.stringify(questions, null, 2)};\n`;

fs.writeFileSync('./lib/demo_questions_2.ts', tsContent);
console.log('Parsed ' + questions.length + ' questions successfully. answerMap size: ' + Object.keys(answerMap).length);
