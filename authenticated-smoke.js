import http from 'k6/http';
import { check, fail, sleep } from 'k6';
import { thaiSummary } from './reporter.js';

// ค่าเหล่านี้รับจาก GitHub Secrets ตอนรันเท่านั้น ห้ามใส่ในไฟล์
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

  // Login ตามระบบจริงผ่าน Supabase แล้วนำ access token เดียวกันไปเรียก API หลังล็อกอิน
  const supabaseLogin = http.post(
    SUPABASE_URL + '/auth/v1/token?grant_type=password',
    JSON.stringify({ email: EMAIL, password: PASSWORD }),
    {
      headers: { apikey: SUPABASE_ANON_KEY, 'Content-Type': 'application/json' },
      tags: { endpoint: 'Login (Supabase)' },
    },
  );
  const loginOk = check(supabaseLogin, {
    'Login ผ่านและได้รับ access token': (r) => r.status === 200 && !!r.json('access_token'),
  });

  if (!loginOk) {
    fail('Login ไม่สำเร็จ จึงหยุดก่อนเรียก API อื่น');
  }

  const accessToken = supabaseLogin.json('access_token');
  const authParams = {
    headers: {
      Authorization: 'Bearer ' + accessToken,
      apikey: SUPABASE_ANON_KEY,
    },
  };

  // ตรวจว่า session ใช้เรียกข้อมูลผู้ใช้ปัจจุบันได้ โดยไม่แก้ไขข้อมูล
  const me = http.get(API_BASE_URL + '/auth/me', {
    ...authParams,
    tags: { endpoint: 'ข้อมูลผู้ใช้ปัจจุบัน' },
  });
  check(me, { 'Session ผู้ใช้ตอบกลับ 200': (r) => r.status === 200 });

  // อ่านรายการโพสต์และเปิดรายละเอียดโพสต์แรกเท่านั้น
  const posts = http.get(API_BASE_URL + '/posts', {
    ...authParams,
    tags: { endpoint: 'รายการโพสต์' },
  });
  check(posts, { 'รายการโพสต์ตอบกลับ 200': (r) => r.status === 200 });

  const post = (posts.json('data') || [])[0];
  if (post?.id) {
    const detail = http.get(API_BASE_URL + '/posts/' + post.id, {
      ...authParams,
      tags: { endpoint: 'รายละเอียดโพสต์' },
    });
    check(detail, { 'รายละเอียดโพสต์ตอบกลับ 200': (r) => r.status === 200 });
  }

  sleep(1);
}

// แสดงสรุปภาษาไทยและบันทึกผลดิบเป็น Artifact
export function handleSummary(data) {
  return thaiSummary(data);
}
