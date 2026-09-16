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
