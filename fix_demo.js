const fs = require('fs');

const data = require('./lib/demo_questions.ts'); // Wait, can't require TS easily. I'll read and replace as string.
let content = fs.readFileSync('./lib/demo_questions.ts', 'utf8');

const answers = {
  1: {ans: 'b', exp: 'อุดมศึกษาสร้างคน สร้างปัญญา ปลูกฝังคุณธรรม เพื่อพัฒนาสังคมไทยอย่างยั่งยืน เป็นวิสัยทัศน์หลักของแผนฯ'},
  2: {ans: 'a', exp: 'แผนประกอบด้วย 3 ยุทธศาสตร์ 10 เป้าหมาย และ 30 ตัวชี้วัด'},
  3: {ans: 'b', exp: 'ขับเคลื่อนผ่าน 7 นโยบายหลัก (Flagship Policies) และ 3 กลไกหลัก (Flagship Mechanisms)'},
  4: {ans: 'b', exp: 'เป้าหมายคือให้สถาบันอุดมศึกษาติด 200 อันดับแรก World Class U Ranking จำนวน 2 แห่ง (ตัวชี้วัด ต5)'},
  5: {ans: 'b', exp: 'แผนตั้งเป้าให้สัดส่วนสายนิสิตสายวิทย์เทียบกับสายสังคมศาสตร์อยู่ที่ 35 : 65 (ตัวชี้วัด ต8)'},
  6: {ans: 'b', exp: 'ตั้งเป้าสัดส่วนบุคลากรสายวิชาการ ปริญญาเอก ต่อ ต่ำกว่าปริญญาเอก ไว้ที่ 50 : 50 (ตัวชี้วัด ต9)'},
  7: {ans: 'c', exp: 'แบ่งเป็น 5 ระยะ โดย Milestone V (ระยะที่ 5) จะสิ้นสุดที่ปี พ.ศ. 2570'},
  8: {ans: 'b', exp: 'ตัวชี้วัด ต1 กำหนดให้สถาบันฯ ต้องผ่านเกณฑ์ ITA อย่างน้อย 86% หรือ 83 แห่ง'},
  9: {ans: 'c', exp: 'การจัดกลุ่มสถาบันอุดมศึกษา (Reinventing University) เป็นกลไกสำคัญในการบริหารจัดการ จึงอยู่ในยุทธศาสตร์ที่ 3: จัดระบบอุดมศึกษาใหม่'},
  10: {ans: 'c', exp: 'FP 3 มุ่งสร้างความเข้มแข็งให้วิสาหกิจชุมชน, SMEs, IDEs และ Deep Tech Startup'},
  11: {ans: 'a', exp: 'ระบบคลังหน่วยกิตมุ่งส่งเสริมให้คนทุกช่วงวัยได้เรียนรู้ต่อเนื่อง จึงตอบโจทย์ยุทธศาสตร์ที่ 1 ด้านพัฒนาศักยภาพคน'},
  12: {ans: 'a', exp: 'FM 1 คือ กลไกการปฏิรูประบบการเงินและงบประมาณที่มุ่งผลสัมฤทธิ์'},
  13: {ans: 'd', exp: 'FP 6 คือ การก้าวสู่การเป็นศูนย์กลางความเชี่ยวชาญระดับนานาชาติ (Hub of Talent & Knowledge)'},
  14: {ans: 'b', exp: 'FP 1 เน้นผลิตกำลังคนสมรรถนะสูงตอบโจทย์อุตสาหกรรมตามโมเดลเศรษฐกิจ BCG'},
  15: {ans: 'b', exp: 'แผนระบุให้ใช้ต้นทุนต่อหน่วย (Unit Cost) ที่สะท้อนคุณภาพและมาตรฐานการศึกษา เป็นฐานในการจัดสรรงบฯ แบบมุ่งผลสัมฤทธิ์'},
  16: {ans: 'c', exp: 'ใช้ระบบงบประมาณผูกพันข้ามปี (Multi-Year Budgeting) ระยะ 3-5 ปี เพื่อให้เกิดความยืดหยุ่น'},
  17: {ans: 'b', exp: 'ใช้กลไกของ "อว. ส่วนหน้า" ในการลงพื้นที่ปฏิบัติงานเชิงรุกและบูรณาการแก้ไขปัญหาในชุมชน'},
  18: {ans: 'c', exp: 'ตามยุทธศาสตร์ Capacity Building อุดมศึกษาต้องขยายกลุ่มเป้าหมายไปยัง Non-Age group ด้วยหลักสูตร Non-Degree เพื่อรับมือสังคมสูงวัย'},
  19: {ans: 'b', exp: 'FM 2 คือ การส่งเสริมธรรมาภิบาล ให้มีความโปร่งใส ตรวจสอบได้ (สอดคล้องกับการแก้ปัญหาด้าน ITA)'},
  20: {ans: 'b', exp: 'ระบบคลังหน่วยกิตแห่งชาติ (National Credit Bank System) และแพลตฟอร์ม Credit Transfer ถูกออกแบบมาเพื่อเทียบโอนประสบการณ์และผลการเรียนข้ามระบบได้'}
};

let lines = content.split('\n');
let newLines = [];
let currentQNum = null;

for (let line of lines) {
  let qNumMatch = line.match(/"question_number":\s*(\d+)/);
  if (qNumMatch) {
    currentQNum = parseInt(qNumMatch[1]);
  }
  
  newLines.push(line);
  
  if (line.includes('"difficulty": 1') && currentQNum) {
    let ansData = answers[currentQNum];
    if (ansData) {
      newLines.push(`    "correct_answer": "${ansData.ans}",`);
      newLines.push(`    "explanation": "${ansData.exp}",`);
      newLines.push(`    "hint": "ลองคิดดูให้ดี หรืออ่านคำถามอีกครั้ง!"`);
    }
  }
}

fs.writeFileSync('./lib/demo_questions.ts', newLines.join('\n'));
console.log('Fixed demo_questions.ts');
