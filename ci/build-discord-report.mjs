import fs from 'node:fs';

// อ่านข้อมูลดิบที่ k6 สร้าง แล้วแปลงเป็นรายงานภาษาไทยสำหรับ Discord
const resultPath = process.env.RESULT_PATH || 'results/latest-summary.json';
const outputPath = process.env.OUTPUT_PATH || 'results/discord-payload.json';
const workflowStatus = process.env.WORKFLOW_STATUS || 'unknown';
const profile = process.env.TEST_PROFILE || 'smoke';
const maxVus = process.env.MAX_VUS || '-';
const runUrl = process.env.RUN_URL || '';

function value(metrics, name, key, fallback = 0) {
  return metrics?.[name]?.values?.[key] ?? fallback;
}

function percent(number) {
  return (Number(number) * 100).toFixed(2) + '%';
}

function ms(number) {
  return Number(number).toFixed(2) + ' ms';
}

function integer(number) {
  return new Intl.NumberFormat('th-TH').format(Number(number));
}

function endpointRows(metrics) {
  return Object.entries(metrics)
    .filter(([name]) => name.startsWith('http_req_duration{endpoint:'))
    .map(([name, metric]) => {
      const matched = name.match(/endpoint:([^,}]+)/);
      const endpoint = matched?.[1] || 'ไม่ระบุชื่อ API';
      const endpointP95 = metric?.values?.['p(95)'] ?? 0;
      return '• ' + endpoint + ': p95 ' + ms(endpointP95);
    })
    .sort();
}

let description;
let color;

try {
  const report = JSON.parse(fs.readFileSync(resultPath, 'utf8'));
  const metrics = report.metrics;
  const failed = value(metrics, 'http_req_failed', 'rate');
  const p95 = value(metrics, 'http_req_duration', 'p(95)');
  const journeyP95 = metrics.journey_duration ? value(metrics, 'journey_duration', 'p(95)') : null;
  const checksPassed = value(metrics, 'checks', 'passes');
  const checksFailed = value(metrics, 'checks', 'fails');
  const totalRequests = value(metrics, 'http_reqs', 'count');
  const requestsPerSecond = value(metrics, 'http_reqs', 'rate');
  const vus = value(metrics, 'vus_max', 'max') || maxVus;
  const endpoints = endpointRows(metrics);
  const reasons = [];

  if (failed >= 0.01) reasons.push('Request ล้มเหลวเกิน 1%');
  if (p95 >= 1000) reasons.push('API p95 เกิน 1,000 ms');
  if (checksFailed > 0) reasons.push('Checks บางข้อไม่ผ่าน');
  if (workflowStatus !== 'success') reasons.push('งาน GitHub Actions จบด้วยสถานะไม่สำเร็จ');

  const passed = reasons.length === 0;
  color = passed ? 0x2ecc71 : 0xe74c3c;

  description = [
    '**สถานะรวม: ' + (passed ? 'ผ่าน ✅' : 'ควรตรวจสอบ ❌') + '**',
    'ชุดทดสอบ: **' + profile + '**' + (profile === 'capacity' ? ' (ตั้งค่าสูงสุด ' + maxVus + ' VUs)' : ''),
    '',
    '**ตัวชี้วัดหลัก**',
    '• ผู้ใช้จำลองสูงสุด: **' + vus + ' VUs**',
    '• จำนวน Request: **' + integer(totalRequests) + '** (' + Number(requestsPerSecond).toFixed(2) + ' req/s)',
    '• Request ล้มเหลว: **' + percent(failed) + '** — เกณฑ์ < 1%',
    '• API p95: **' + ms(p95) + '** — เกณฑ์ < 1,000 ms',
    ...(journeyP95 === null ? [] : ['• Journey p95: **' + ms(journeyP95) + '**']),
    '• Checks: **ผ่าน ' + integer(checksPassed) + ' | ไม่ผ่าน ' + integer(checksFailed) + '**',
    ...(endpoints.length === 0 ? [] : ['', '**เวลา p95 แยกตาม API**', ...endpoints]),
    '',
    '**ความหมายของตัวเลข**',
    '• VUs: จำนวนผู้ใช้จำลองที่เข้าใช้งานพร้อมกัน',
    '• Request: จำนวนคำขอที่ k6 ส่งไปยังหน้าและ API ระหว่างทดสอบ',
    '• Request ล้มเหลว: ถ้าเป็น 0% แปลว่าไม่มีคำขอที่ล้มเหลว',
    '• API p95: 95 จาก 100 คำขอตอบกลับภายใน ' + ms(p95) + '; เป้าหมายต้องต่ำกว่า 1,000 ms',
    '• Checks: การตรวจย่อย เช่น status 200 และรูปแบบข้อมูลที่คาดหวัง',
    '',
    '**สรุปความหมาย**',
    passed
      ? '✅ ระบบผ่านเกณฑ์: error ต่ำกว่า 1% และผู้ใช้ส่วนใหญ่ตอบกลับภายใน 1 วินาที'
      : '⚠️ ' + reasons.join(' | ') + '. ตรวจรายละเอียดและ Artifact ใน GitHub Actions ก่อนเพิ่มจำนวน VUs',
    '',
    'p95 คือ 95 จาก 100 request ต้องตอบกลับภายในเวลาที่แสดง',
    'กดหัวข้อรายงานนี้เพื่อเปิดรายละเอียดผลทดสอบใน GitHub Actions',
  ].join('\n');
} catch {
  color = 0xe74c3c;
  description = '**สถานะรวม: ไม่สามารถอ่านผล k6 ได้ ❌**\nชุดทดสอบ: **' + profile + '**\nโปรดเปิด GitHub Actions เพื่อตรวจ log และ Artifact';
}

const payload = {
  username: 'Share-Ed Load Test',
  embeds: [{ title: 'รายงาน Load Test: Share-Ed', description, color, url: runUrl }],
  allowed_mentions: { parse: [] },
};

fs.writeFileSync(outputPath, JSON.stringify(payload));
