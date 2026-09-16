import http from 'k6/http';
import { check, sleep } from 'k6';
import { Trend } from 'k6/metrics';
import { thaiSummary } from './reporter.js';

const API_BASE_URL = __ENV.API_BASE_URL || 'https://share-ed-backend-6jer.onrender.com/api/v1';
const WEB_BASE_URL = __ENV.WEB_BASE_URL || 'https://share-ed.online';

// เก็บเวลาของแต่ละส่วนแยกกัน เพื่อหาจุดที่ช้าจริง
const homeDuration = new Trend('web_home_duration', true);
const postsDuration = new Trend('api_posts_duration', true);
const categoriesDuration = new Trend('api_categories_duration', true);
const profileDuration = new Trend('api_profile_duration', true);

export const options = {
    vus: 1,
    iterations: 5,
    thresholds: {
        http_req_failed: ['rate<0.01'],
        http_req_duration: ['p(95)<1000'],
    },
};

export default function () {
    // เวลาโหลดหน้า Home จากมุมมองผู้ใช้ทั่วไป
    const home = http.get(WEB_BASE_URL + '/home', { tags: { name: 'web_home' } });
    homeDuration.add(home.timings.duration);
    check(home, { 'หน้า Home ตอบกลับ 200': (r) => r.status === 200 });

    // หน้า Explore, Trending และ Search ใช้รายการโพสต์ชุดนี้
    const posts = http.get(API_BASE_URL + '/posts', { tags: { name: 'api_posts' } });
    postsDuration.add(posts.timings.duration);
    check(posts, {
        'รายการโพสต์ตอบกลับ 200': (r) => r.status === 200,
        'ผลลัพธ์รายการโพสต์สำเร็จ': (r) => r.json('success') === true,
    });

    // หมวดหมู่ที่ใช้ในหน้า Explore
    const categories = http.get(API_BASE_URL + '/categories', { tags: { name: 'api_categories' } });
    categoriesDuration.add(categories.timings.duration);
    check(categories, { 'หมวดหมู่ตอบกลับ 200': (r) => r.status === 200 });

    // ใช้เฉพาะ ID ผู้เขียนที่มากับข้อมูลสาธารณะ ไม่สร้างหรือแก้ไขข้อมูลใด ๆ
    const data = posts.json('data') || [];
    const authorId = data[0] && data[0].author_id;
    if (authorId) {
        const profile = http.get(API_BASE_URL + '/users/' + authorId, { tags: { name: 'api_user_profile' } });
        profileDuration.add(profile.timings.duration);
        check(profile, { 'โปรไฟล์ผู้เขียนตอบกลับ 200': (r) => r.status === 200 });
    }

    sleep(1);
}

// แสดงสรุปภาษาไทย และบันทึกไฟล์ผลลัพธ์สำหรับเปรียบเทียบ
export function handleSummary(data) {
    return thaiSummary(data);
}
