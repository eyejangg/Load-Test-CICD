// สร้างรายงานภาษาไทยที่อ่านง่ายใน Command Prompt หลัง k6 รันจบ
function metric(data, name, key, fallback = 0) {
    return data.metrics[name]?.values?.[key] ?? fallback;
}

function percent(value) {
    return `${(value * 100).toFixed(2)}%`;
}

function milliseconds(value) {
    return `${Number(value).toFixed(2)} ms`;
}

function thresholdStatus(data) {
    const all = Object.values(data.metrics).flatMap((item) => Object.values(item.thresholds || {}));
    return all.length === 0 || all.every((threshold) => threshold.ok);
}

export function thaiSummary(data) {
    const failedRate = metric(data, 'http_req_failed', 'rate');
    const p95 = metric(data, 'http_req_duration', 'p(95)');
    const journeyP95 = metric(data, 'journey_duration', 'p(95)', null);
    const requests = metric(data, 'http_reqs', 'count');
    const requestsPerSecond = metric(data, 'http_reqs', 'rate');
    const passedChecks = metric(data, 'checks', 'passes');
    const failedChecks = metric(data, 'checks', 'fails');
    const vusMax = metric(data, 'vus_max', 'max');
    const passed = thresholdStatus(data) && failedChecks === 0;

    const lines = [
        '',
        '========== รายงาน Load Test: Share-Ed ==========',
        `สถานะรวม: ${passed ? 'ผ่าน ✅' : 'ควรตรวจสอบ ❌'}`,
        `ผู้ใช้จำลองสูงสุด: ${vusMax} VUs`,
        `จำนวน Request: ${requests} (${requestsPerSecond.toFixed(2)} req/s)`,
        `Checks: ผ่าน ${passedChecks} | ไม่ผ่าน ${failedChecks}`,
        `Request ล้มเหลว: ${percent(failedRate)}  (เกณฑ์: < 1%)`,
        `API p95: ${milliseconds(p95)}  (เกณฑ์: < 1000 ms)`,
    ];

    if (journeyP95 !== null) {
        lines.push(`Journey p95: ${milliseconds(journeyP95)}  (เกณฑ์: < 5000 ms)`);
    }

    if (passed) {
        lines.push('สรุป: ระบบผ่านเกณฑ์ที่กำหนดในรอบการทดสอบนี้');
    } else if (failedRate >= 0.01) {
        lines.push('สรุป: Error เกินเกณฑ์ ให้ดู endpoint ที่ error ในรายงาน k6 ก่อนเพิ่มจำนวน VUs');
    } else if (p95 >= 1000) {
        lines.push('สรุป: API ช้าเกินเกณฑ์ ให้ดูค่า p95 ของแต่ละ endpoint และ log ของ backend/database');
    } else {
        lines.push('สรุป: มี check หรือ threshold ไม่ผ่าน ให้ตรวจบรรทัดที่มีเครื่องหมาย ✗ ในผล k6');
    }
    lines.push('==================================================', '');

    return {
        stdout: `${lines.join('\n')}\n`,
        // เก็บข้อมูลดิบอัตโนมัติ เพื่อนำมาเปรียบเทียบก่อนและหลังปรับระบบ
        'results/latest-summary.json': JSON.stringify(data, null, 2),
    };
}
