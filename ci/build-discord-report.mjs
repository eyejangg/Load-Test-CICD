import fs from 'node:fs';

// อ่านข้อมูลดิบที่ k6 สร้าง แล้วแปลงเป็นข้อความสั้น ๆ สำหรับ Discord
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
    return `${(Number(number) * 100).toFixed(2)}%`;
}

function ms(number) {
    return `${Number(number).toFixed(2)} ms`;
}

let description;
let color;

try {
    const report = JSON.parse(fs.readFileSync(resultPath, 'utf8'));
    const metrics = report.metrics;
    const failed = value(metrics, 'http_req_failed', 'rate');
    const p95 = value(metrics, 'http_req_duration', 'p(95)');
    const journeyP95 = metrics.journey_duration ? value(metrics, 'journey_duration', 'p(95)') : null;
    const checksFailed = value(metrics, 'checks', 'fails');
    const passed = workflowStatus === 'success' && failed < 0.01 && p95 < 1000 && checksFailed === 0;

    color = passed ? 0x2ecc71 : 0xe74c3c;
    description = [
        `สถานะ: ${passed ? 'ผ่าน ✅' : 'ไม่ผ่าน ❌'}`,
        `ชุดทดสอบ: ${profile}${profile === 'capacity' ? ` (${maxVus} VUs)` : ''}`,
        `Request ล้มเหลว: ${percent(failed)}`,
        `API p95: ${ms(p95)}`,
        ...(journeyP95 === null ? [] : [`Journey p95: ${ms(journeyP95)}`]),
        `Checks ไม่ผ่าน: ${checksFailed}`,
    ].join('\n');
} catch {
    color = 0xe74c3c;
    description = `สถานะ: ไม่สามารถอ่านผล k6 ได้ ❌\nชุดทดสอบ: ${profile}\nดูรายละเอียดใน GitHub Actions`;
}

const payload = {
    username: 'Share-Ed Load Test',
    embeds: [{ title: 'รายงาน Load Test: Share-Ed', description, color, url: runUrl }],
    allowed_mentions: { parse: [] },
};

fs.writeFileSync(outputPath, JSON.stringify(payload));