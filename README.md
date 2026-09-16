# Share-Ed Load Test

โปรเจกต์นี้ใช้ **k6**, **GitHub Actions** และ **Discord** เพื่อตรวจสอบความเร็วและความเสถียรของเว็บไซต์ Share-Ed แบบอัตโนมัติ โดยเน้นการอ่านข้อมูลสาธารณะ จึงไม่สร้าง แก้ไข หรือลบข้อมูลจริง

## ระบบนี้ทำงานอย่างไร

Push โค้ด หรือกด Run workflow → GitHub Actions เปิดเครื่องทดสอบชั่วคราว → Docker รัน k6 → วัดเวลาและความผิดพลาด → เก็บผลลัพธ์ → ส่งสรุปเข้า Discord

หากค่า Threshold ไม่ผ่าน งานจะขึ้นสีแดงเพื่อเตือนให้ตรวจสอบ ไม่ได้แปลว่า GitHub Actions เสีย

## ชุดทดสอบที่มี

| เลือกใน Workflow | ไฟล์ | ใช้ตรวจอะไร | เมื่อควรใช้ |
| --- | --- | --- | --- |
| smoke | smoke-test.js | ผู้ใช้ 1 คน 3 รอบ: Home, รายการโพสต์, หมวดหมู่ และ Profile | ใช้หลังแก้โค้ดทุกครั้ง |
| diagnostic | diagnostic-test.js | ผู้ใช้ 1 คน 5 รอบ และแยกเวลา p95 ของแต่ละ API | ใช้หาจุดที่ช้า |
| load20 | load-test.js | เพิ่มผู้ใช้จำลองขึ้นไปถึง 20 VUs | ใช้ตรวจโหลดปกติก่อนนำเสนอ |
| capacity | capacity-test.js | เพิ่มได้ 20, 50 หรือ 100 VUs ตามค่าที่เลือก | ใช้ประเมินขีดความสามารถแบบค่อยเป็นค่อยไป |
| ไม่ได้รันอัตโนมัติ | authenticated-smoke.js | เส้นทางหลังล็อกอิน | ใช้เมื่อกำหนดบัญชีทดสอบใน Secret แล้วเท่านั้น |

**VU (Virtual User)** คือผู้ใช้จำลอง 1 คน ไม่ใช่บัญชีผู้ใช้จริง 1 บัญชี

## แต่ละขั้นตอนใน Workflow ทำอะไรบ้าง

1. **ดาวน์โหลดไฟล์จาก repository** — นำ script และ workflow เวอร์ชันล่าสุดมาใช้
2. **เตรียมโฟลเดอร์ผลลัพธ์** — สร้างโฟลเดอร์ results เพื่อเก็บ JSON และสรุป
3. **รัน k6 ตามชุดที่เลือก** — เลือกไฟล์จากค่า TEST_PROFILE
4. **สรุปผลภาษาไทย** — reporter.js อ่านผลดิบของ k6 และพิมพ์ Request, error rate, p95 และ Checks
5. **สร้างข้อความสำหรับ Discord** — ci/build-discord-report.mjs แปลงผลเป็นข้อความอ่านง่าย พร้อมลิงก์ไปยัง Action run
6. **ส่งรายงานเข้า Discord** — ทำเฉพาะเมื่อมี GitHub Secret ชื่อ DISCORD_WEBHOOK_URL
7. **เก็บผลเป็น Artifact** — ดาวน์โหลดผลย้อนกลับได้จากหน้า Action ภายใน 30 วัน
8. **จบงานตามผล k6** — ถ้า Threshold ไม่ผ่าน งานจะ fail เพื่อให้เห็นปัญหาชัดเจน

## วิธีรันจาก GitHub

1. เปิดแท็บ **Actions** ของ repository
2. เลือก workflow **Share-Ed Load Test**
3. กด **Run workflow**
4. เลือก smoke, diagnostic, load20 หรือ capacity
5. ถ้าเลือก capacity ให้เลือกจำนวนสูงสุด 20, 50 หรือ 100 VUs
6. เปิดงานที่รันเสร็จเพื่อดู Console, Discord step และ Artifact

เริ่มจาก smoke ก่อนเสมอ แล้วใช้ diagnostic เมื่ออยากรู้ว่า API ใดช้า จากนั้นค่อยเพิ่มเป็น load20 และ capacity

## วิธีรันบนเครื่องตัวเองด้วย Command Prompt

1. เปิด Command Prompt
2. พิมพ์ cd /d D:\LoadTestEye
3. พิมพ์ docker run --rm -v "%cd%:/work" -w /work grafana/k6:1.7.1 run smoke-test.js

เปลี่ยน smoke-test.js เป็น diagnostic-test.js, load-test.js หรือ capacity-test.js ได้ตามต้องการ

## อ่านผลอย่างไร

| ค่า | ดีเมื่อ | ความหมาย |
| --- | --- | --- |
| http_req_failed | น้อยกว่า 1% | สัดส่วน request ที่ล้มเหลว |
| http_req_duration p95 | น้อยกว่า 1,000 ms | 95 ใน 100 request ตอบกลับภายใน 1 วินาที |
| checks | ผ่าน 100% | การตรวจ status และข้อมูลที่คาดหวังผ่าน |
| http_reqs | ดูประกอบกัน | จำนวน request ที่ระบบรับได้ต่อวินาที |

**p95** สำคัญกว่าแค่ค่าเฉลี่ย เพราะบอกประสบการณ์ของผู้ใช้ส่วนใหญ่ แม้บาง request จะช้ากว่าปกติ

## ดูผลลัพธ์ที่ไหน

- **หน้า Action log**: ดูสรุปภาษาไทยและขั้นตอนที่ผ่านหรือไม่ผ่าน
- **Artifact ชื่อ load-test-results**: ดาวน์โหลดไฟล์ผลดิบและสรุปกลับมาตรวจละเอียด
- **Discord**: รับสรุปอัตโนมัติเมื่อกำหนด DISCORD_WEBHOOK_URL แล้ว

## การตั้งค่า Discord อย่างปลอดภัย

สร้าง Webhook ในช่อง Discord แล้วนำไปเก็บที่ GitHub: Settings → Secrets and variables → Actions → New repository secret

ตั้งชื่อ **DISCORD_WEBHOOK_URL** และวาง URL ของ Webhook ในช่องค่า ห้ามใส่ URL นี้ไว้ในโค้ด, README หรือข้อความสาธารณะ หากเคยเผยแพร่ URL แล้ว ให้สร้าง Webhook ใหม่ทันที

## ความปลอดภัยของการทดสอบ

- Script ปัจจุบันใช้เฉพาะ API อ่านข้อมูลสาธารณะ
- ไม่มีการสร้างโพสต์ แก้ไขโปรไฟล์ หรือลบข้อมูล
- การทดสอบหลังล็อกอินต้องใช้บัญชีทดสอบและ Secret เท่านั้น
- เพิ่ม VUs ทีละระดับ: 20 → 50 → 100 และหยุดทันทีหาก error เพิ่มขึ้นหรือ p95 แย่ลง

## สิ่งที่ควรทำก่อนรองรับ 20–100 คนพร้อมกัน

1. รัน smoke ทุกครั้งหลังปรับระบบ
2. รัน diagnostic เพื่อหาหน้า/API ที่ช้า
3. รัน load20 ก่อน แล้วค่อยเพิ่ม capacity เป็น 50 และ 100 VUs
4. เปรียบเทียบ p95, error rate และ request ต่อวินาทีของแต่ละรอบ
5. ตรวจ log ของ backend, database และ Render เมื่อ API เริ่มช้า
6. ปรับ query, index, pagination หรือ cache ที่ backend แล้วรันทดสอบซ้ำ

## ผลตรวจล่าสุดที่ควรติดตาม

Diagnostic run ล่าสุดพบว่า API **รายการโพสต์** มี p95 ประมาณ **1,170 ms** จึงควรเป็นจุดแรกที่ตรวจใน backend/database ก่อนเพิ่มโหลดสูงกว่า 20 VUs
