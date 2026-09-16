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
