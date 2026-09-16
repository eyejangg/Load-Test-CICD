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
