# รวมไฟล์ CI/CD และ Discord สำหรับ Share-Ed

คัดลอกเนื้อหาแต่ละหัวข้อไปสร้างไฟล์ตาม path ที่ระบุ โดยให้โฟลเดอร์ `.github` และ `ci` อยู่ใน root ของ GitHub repository.

## `smoke-test.js`

```javascript
import http from 'k6/http';
import { check, sleep } from 'k6';
import { thaiSummary } from './reporter.js';

const API_BASE_URL = __ENV.API_BASE_URL || 'https://share-ed-backend-6jer.onrender.com/api/v1';
const WEB_BASE_URL = __ENV.WEB_BASE_URL || 'https://share-ed.online';

export const options = {
    vus: 1,
    iterations: 3,
    thresholds: {
        http_req_failed: ['rate<0.01'],
        http_req_duration: ['p(95)<1000'],
    },
};

export default function () {
    // ตรวจหน้า Home ก่อน เพื่อยืนยันว่าเว็บส่วนหน้าพร้อมใช้งาน
    const home = http.get(`${WEB_BASE_URL}/home`, { tags: { name: 'web_home' } });
    check(home, { 'หน้า Home ตอบกลับ 200': (r) => r.status === 200 });

    // หน้า Explore, Trending และ Search โหลดรายการโพสต์จาก API นี้
    const posts = http.get(`${API_BASE_URL}/posts`, { tags: { name: 'api_posts' } });
    check(posts, {
        'รายการโพสต์ตอบกลับ 200': (r) => r.status === 200,
        'ผลลัพธ์รายการโพสต์สำเร็จ': (r) => r.json('success') === true,
        'มีโพสต์อย่างน้อยหนึ่งรายการ': (r) => Array.isArray(r.json('data')) && r.json('data').length > 0,
    });

    const data = posts.json('data') || [];
    const post = data[0];
    if (!post) return;

    // เปิดโปรไฟล์ผู้เขียน ซึ่งเป็นข้อมูลสาธารณะที่ผู้ใช้ทั่วไปเข้าถึงได้
    const profile = http.get(`${API_BASE_URL}/users/${post.author_id}`, { tags: { name: 'api_user_profile' } });
    check(profile, { 'โปรไฟล์ผู้เขียนตอบกลับ 200': (r) => r.status === 200 });

    // โหลดหมวดหมู่ที่หน้า Explore ใช้แสดงและกรองเนื้อหา
    const categories = http.get(`${API_BASE_URL}/categories`, { tags: { name: 'api_categories' } });
    check(categories, { 'หมวดหมู่ตอบกลับ 200': (r) => r.status === 200 });

    // หน้า Search กรองชื่อโพสต์จากรายการที่โหลดแล้ว จึงไม่มี API Search แยก
    check(posts, { 'มีชื่อโพสต์ให้ค้นหา': (r) => r.body.includes(post.title) });
    sleep(1);
}

// ให้ k6 แสดงสรุปภาษาไทยและบันทึกผลดิบหลังทดสอบเสร็จ
export function handleSummary(data) {
    return thaiSummary(data);
}

```

## `load-test.js`

```javascript
import http from 'k6/http';
import { check, sleep } from 'k6';
import { thaiSummary } from './reporter.js';

const API_BASE_URL = __ENV.API_BASE_URL || 'https://share-ed-backend-6jer.onrender.com/api/v1';
const WEB_BASE_URL = __ENV.WEB_BASE_URL || 'https://share-ed.online';

export const options = {
    stages: [
        { duration: '30s', target: 5 },
        { duration: '1m', target: 10 },
        { duration: '1m', target: 20 },
        { duration: '30s', target: 0 },
    ],
    thresholds: {
        http_req_failed: ['rate<0.01'],
        http_req_duration: ['p(95)<1000'],
    },
};

export default function () {
    // จำลองผู้ใช้ที่เข้าหน้า Home แล้วเริ่มสำรวจเนื้อหา
    const home = http.get(`${WEB_BASE_URL}/home`, { tags: { name: 'web_home' } });
    check(home, { 'หน้า Home ตอบกลับ 200': (r) => r.status === 200 });

    const posts = http.get(`${API_BASE_URL}/posts`, { tags: { name: 'api_posts' } });
    check(posts, { 'รายการโพสต์ตอบกลับ 200': (r) => r.status === 200 && r.json('success') === true });

    const data = posts.json('data') || [];
    const post = data[(__VU - 1) % data.length];
    if (!post) {
        sleep(1);
        return;
    }

    // กระจายการเปิดโปรไฟล์ไปยังผู้เขียนหลายคนตามหมายเลข VU
    const profile = http.get(`${API_BASE_URL}/users/${post.author_id}`, { tags: { name: 'api_user_profile' } });
    check(profile, { 'โปรไฟล์ผู้เขียนตอบกลับ 200': (r) => r.status === 200 });

    const categories = http.get(`${API_BASE_URL}/categories`, { tags: { name: 'api_categories' } });
    check(categories, { 'หมวดหมู่ตอบกลับ 200': (r) => r.status === 200 });

    // Search เป็นการกรองรายการในเบราว์เซอร์ จึงยืนยันด้วยข้อมูลรายการโพสต์เดิม
    check(posts, { 'มีชื่อโพสต์ให้ค้นหา': (r) => r.body.includes(post.title) });
    sleep(1 + Math.random() * 2);
}

// ให้ k6 แสดงสรุปภาษาไทยและบันทึกผลดิบหลังทดสอบเสร็จ
export function handleSummary(data) {
    return thaiSummary(data);
}

```

## `capacity-test.js`

```javascript
import http from 'k6/http';
import { check, sleep } from 'k6';
import { Trend } from 'k6/metrics';
import { thaiSummary } from './reporter.js';

// เปลี่ยน MAX_VUS ตอนรันเพื่อทดสอบ 20, 50 หรือ 100 ผู้ใช้จำลอง
// ตัวอย่าง: k6 run -e MAX_VUS=50 capacity-test.js
const MAX_VUS = Number(__ENV.MAX_VUS || 20);
const API_BASE_URL = __ENV.API_BASE_URL || 'https://share-ed-backend-6jer.onrender.com/api/v1';
const WEB_BASE_URL = __ENV.WEB_BASE_URL || 'https://share-ed.online';

// เก็บเวลารวมต่อหนึ่ง journey เพื่อเปรียบเทียบความเร็วของระบบก่อนและหลังปรับปรุง
const journeyDuration = new Trend('journey_duration', true);

export const options = {
    stages: [
        // เพิ่มโหลดทีละระดับ เพื่อลดความเสี่ยงที่โหลดกระชากทันที
        { duration: '1m', target: Math.max(1, Math.round(MAX_VUS * 0.25)) },
        { duration: '2m', target: Math.max(1, Math.round(MAX_VUS * 0.5)) },
        { duration: '5m', target: MAX_VUS },
        // ลดโหลดอย่างค่อยเป็นค่อยไปก่อนจบการทดสอบ
        { duration: '1m', target: 0 },
    ],
    thresholds: {
        http_req_failed: ['rate<0.01'],
        http_req_duration: ['p(95)<1000'],
        journey_duration: ['p(95)<5000'],
    },
};

export default function () {
    const startedAt = Date.now();

    // ตรวจหน้า public หลักทั้งหมดพร้อมกัน: หน้าแรก, Home, Explore และ Trending
    const pages = http.batch([
        ['GET', `${WEB_BASE_URL}/`, null, { tags: { name: 'web_landing' } }],
        ['GET', `${WEB_BASE_URL}/home`, null, { tags: { name: 'web_home' } }],
        ['GET', `${WEB_BASE_URL}/explore`, null, { tags: { name: 'web_explore' } }],
        ['GET', `${WEB_BASE_URL}/trending`, null, { tags: { name: 'web_trending' } }],
    ]);
    check(pages, { 'หน้า public ทุกหน้าตอบกลับ 200': (responses) => responses.every((r) => r.status === 200) });

    // โหลดข้อมูลที่หน้า Explore, Trending และ Search ใช้ร่วมกัน
    const posts = http.get(`${API_BASE_URL}/posts`, { tags: { name: 'api_posts' } });
    check(posts, { 'รายการโพสต์ตอบกลับ 200': (r) => r.status === 200 && r.json('success') === true });

    const categories = http.get(`${API_BASE_URL}/categories`, { tags: { name: 'api_categories' } });
    check(categories, { 'หมวดหมู่ตอบกลับ 200': (r) => r.status === 200 });

    // กระจายการเปิดโปรไฟล์ไปยังผู้เขียนหลายคน โดยเลือกตามหมายเลข VU
    const data = posts.json('data') || [];
    const post = data[(__VU - 1) % data.length];
    if (post && post.author_id) {
        const profile = http.get(`${API_BASE_URL}/users/${post.author_id}`, { tags: { name: 'api_user_profile' } });
        check(profile, { 'โปรไฟล์ผู้เขียนตอบกลับ 200': (r) => r.status === 200 });

        // Search ของเว็บกรองจากรายการโพสต์เดิม จึงตรวจว่ามีชื่อโพสต์ในข้อมูลที่ดาวน์โหลด
        check(posts, { 'มีข้อมูลสำหรับ Search': (r) => r.body.includes(post.title) });
    }

    journeyDuration.add(Date.now() - startedAt);
    // เว้นช่วงจำลองเวลาที่ผู้ใช้ใช้เลือกอ่านเนื้อหาก่อนทำรอบถัดไป
    sleep(1 + Math.random() * 3);
}

// ให้ k6 แสดงสรุปภาษาไทยและบันทึกผลดิบหลังทดสอบเสร็จ
export function handleSummary(data) {
    return thaiSummary(data);
}

```

## `authenticated-smoke.js`

```javascript
import http from 'k6/http';
import { check, fail, sleep } from 'k6';
import { thaiSummary } from './reporter.js';

// กำหนดค่าเหล่านี้ตอนรันเท่านั้น ห้ามบันทึกบัญชีจริงหรือ key ลงในไฟล์
const API_BASE_URL = __ENV.API_BASE_URL || 'https://share-ed-backend-6jer.onrender.com/api/v1';
const SUPABASE_URL = __ENV.SUPABASE_URL || 'https://bzxlqtzspmtnpibfsuei.supabase.co';
const EMAIL = __ENV.EMAIL;
const PASSWORD = __ENV.PASSWORD;
const SUPABASE_ANON_KEY = __ENV.SUPABASE_ANON_KEY;

export const options = {
    vus: 1,
    iterations: 1,
    thresholds: {
        http_req_failed: ['rate<0.01'],
        http_req_duration: ['p(95)<1000'],
    },
};

export default function () {
    if (!EMAIL || !PASSWORD || !SUPABASE_ANON_KEY) {
        fail('กรุณากำหนด EMAIL, PASSWORD และ SUPABASE_ANON_KEY ก่อนรัน');
    }

    // จำลอง Login ที่หน้าเว็บทำจริง: Supabase ก่อน แล้วจึงสร้าง session กับ Share-Ed
    const supabaseLogin = http.post(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, JSON.stringify({ email: EMAIL, password: PASSWORD }), {
        headers: { apikey: SUPABASE_ANON_KEY, 'Content-Type': 'application/json' },
        tags: { name: 'supabase_login' },
    });
    check(supabaseLogin, { 'Supabase Login สำเร็จ': (r) => r.status === 200 && !!r.json('access_token') });

    const backendLogin = http.post(`${API_BASE_URL}/auth/login`, JSON.stringify({ email: EMAIL, password: PASSWORD }), {
        headers: { 'Content-Type': 'application/json' },
        tags: { name: 'api_login' },
    });
    check(backendLogin, { 'Share-Ed Login สำเร็จ': (r) => r.status === 200 });

    // นำ token ที่ backend คืนมาไปเรียกข้อมูลที่ต้อง Login โดยไม่เปลี่ยนข้อมูลใด ๆ
    const token = backendLogin.json('token') || backendLogin.json('access_token') || backendLogin.json('data.token');
    const authParams = { headers: token ? { Authorization: `Bearer ${token}` } : {} };
    const me = http.get(`${API_BASE_URL}/auth/me`, { ...authParams, tags: { name: 'api_me' } });
    check(me, { 'ข้อมูลผู้ใช้ปัจจุบันตอบกลับ 200': (r) => r.status === 200 });

    const posts = http.get(`${API_BASE_URL}/posts`, { tags: { name: 'api_posts' } });
    const post = (posts.json('data') || [])[0];
    if (post) {
        const detail = http.get(`${API_BASE_URL}/posts/${post.id}`, { ...authParams, tags: { name: 'api_post_detail' } });
        check(detail, { 'รายละเอียดโพสต์หลัง Login ตอบกลับ 200': (r) => r.status === 200 });
    }
    sleep(1);
}

// ให้ k6 แสดงสรุปภาษาไทยและบันทึกผลดิบหลังทดสอบเสร็จ
export function handleSummary(data) {
    return thaiSummary(data);
}

```

## `reporter.js`

```javascript
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

```

## `ci/build-discord-report.mjs`

```javascript
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

```

## `.github/workflows/load-test.yml`

```yaml
name: Share-Ed Load Test

on:
  # ทุก push เข้า main จะรันเพียง Smoke Test เพื่อไม่ให้ production ถูกโหลดหนักโดยอัตโนมัติ
  push:
    branches: [main]
    paths:
      - '**.js'
      - '.github/workflows/load-test.yml'

  # ใช้ปุ่ม Run workflow เพื่อเลือกทดสอบ 20, 50 หรือ 100 VUs ด้วยตนเอง
  workflow_dispatch:
    inputs:
      test_profile:
        description: 'เลือกชุดทดสอบ'
        required: true
        default: smoke
        type: choice
        options: [smoke, load20, capacity]
      max_vus:
        description: 'ใช้เมื่อเลือก capacity: 20, 50 หรือ 100'
        required: true
        default: '20'
        type: choice
        options: ['20', '50', '100']

permissions:
  contents: read

jobs:
  load-test:
    runs-on: ubuntu-latest
    timeout-minutes: 20
    env:
      TEST_PROFILE: ${{ inputs.test_profile || 'smoke' }}
      MAX_VUS: ${{ inputs.max_vus || '20' }}
      # Secret นี้จะไม่ถูกพิมพ์ออกมาใน log และไม่ต้องใส่ค่าไว้ในโค้ด
      DISCORD_WEBHOOK_URL: ${{ secrets.DISCORD_WEBHOOK_URL }}
      RUN_URL: ${{ github.server_url }}/${{ github.repository }}/actions/runs/${{ github.run_id }}

    steps:
      - name: ดาวน์โหลดไฟล์จาก repository
        uses: actions/checkout@v4

      - name: เตรียมโฟลเดอร์ผลทดสอบ
        run: mkdir -p results

      - name: รัน k6 ตามชุดทดสอบที่เลือก
        id: k6
        continue-on-error: true
        run: |
          case "$TEST_PROFILE" in
            smoke)
              docker run --rm -v "$PWD:/work" -w /work grafana/k6:1.7.1 run smoke-test.js
              ;;
            load20)
              docker run --rm -v "$PWD:/work" -w /work grafana/k6:1.7.1 run load-test.js
              ;;
            capacity)
              docker run --rm -v "$PWD:/work" -w /work grafana/k6:1.7.1 run -e MAX_VUS="$MAX_VUS" capacity-test.js
              ;;
            *)
              echo "ไม่รู้จักชุดทดสอบ: $TEST_PROFILE"
              exit 2
              ;;
          esac

      - name: สร้างข้อความรายงานสำหรับ Discord
        if: always()
        env:
          WORKFLOW_STATUS: ${{ steps.k6.outcome }}
        run: node ci/build-discord-report.mjs

      - name: ส่งรายงานเข้า Discord
        if: ${{ always() && env.DISCORD_WEBHOOK_URL != '' }}
        run: |
          curl --fail --request POST "$DISCORD_WEBHOOK_URL" \
            --header 'Content-Type: application/json' \
            --data @results/discord-payload.json

      - name: เก็บผลทดสอบเป็นไฟล์ดาวน์โหลด
        if: always()
        uses: actions/upload-artifact@v4
        with:
          name: load-test-${{ github.run_id }}
          path: results/
          if-no-files-found: warn
          retention-days: 30

      # ให้ workflow เป็นสีแดงเมื่อ k6 ไม่ผ่าน แม้จะส่งรายงานและเก็บ artifact เรียบร้อยแล้ว
      - name: จบงานตามผล k6
        if: steps.k6.outcome != 'success'
        run: exit 1

```

## `คู่มือ-เชื่อม-GitHub-Discord.md`

```markdown
# วิธีเชื่อม GitHub Actions และ Discord

## 1. เตรียม repository

โฟลเดอร์ `D:\LoadTestEye` ปัจจุบันยังไม่ใช่ Git repository จึงต้องนำไฟล์ Load Test ไปเก็บใน repository ของ Share-Ed ก่อน หรือสร้าง repository ใหม่สำหรับเก็บสคริปต์ทดสอบโดยเฉพาะ

วางไฟล์จากชุดนี้ไว้ที่ root ของ repository ตามโครงสร้างนี้:

```text
repository-root/
├── smoke-test.js
├── load-test.js
├── capacity-test.js
├── authenticated-smoke.js
├── reporter.js
├── ci/
│   └── build-discord-report.mjs
└── .github/
    └── workflows/
        └── load-test.yml
```

## 2. สร้าง Discord Webhook

1. เปิด Discord server และเข้า channel ที่ต้องการรับรายงาน
2. กดรูปฟันเฟืองของ channel → **Integrations** → **Webhooks**
3. กด **New Webhook** และตั้งชื่อ เช่น `Share-Ed Load Test`
4. กด **Copy Webhook URL**

Webhook URL เป็นความลับ เพราะผู้ที่มี URL สามารถส่งข้อความเข้าห้องได้ ห้ามวางไว้ในไฟล์หรือ commit ขึ้น GitHub

## 3. เก็บ Webhook URL ใน GitHub Secret

1. เปิด repository บน GitHub → **Settings**
2. ไปที่ **Secrets and variables** → **Actions**
3. กด **New repository secret**
4. ตั้งชื่อว่า `DISCORD_WEBHOOK_URL`
5. วาง Webhook URL แล้วกด **Add secret**

## 4. เริ่มใช้งาน

- Push ไป branch `main` → ระบบรัน `smoke-test.js` และส่งผล Discord อัตโนมัติ
- หากต้องการ 20/50/100 VUs → GitHub repository → **Actions** → **Share-Ed Load Test** → **Run workflow**
- เลือก `capacity` และเลือก VUs จากนั้นกด Run workflow

ไม่แนะนำให้ตั้ง 50 หรือ 100 VUs ให้รันทุก push เพราะจะสร้างโหลดบน production โดยไม่จำเป็น

## 5. ตรวจผล

- Discord: ดูสรุปสั้น เช่น ผ่าน/ไม่ผ่าน, error rate, API p95 และ Journey p95
- GitHub Actions: ดู log เต็มของแต่ละขั้น
- GitHub Actions → Artifacts: ดาวน์โหลด JSON รายละเอียดจาก `results/`

## 6. Login test

ยังไม่เปิด Login Test ใน CI เพื่อไม่ให้ส่ง credential ไปยัง runner โดยไม่จำเป็น หากภายหลังต้องการ ให้สร้าง GitHub Secrets ชื่อ `EMAIL`, `PASSWORD`, `SUPABASE_ANON_KEY` และเพิ่ม job แยกที่จำกัดเป็น 1 VU เท่านั้น

```


