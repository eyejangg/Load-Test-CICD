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
