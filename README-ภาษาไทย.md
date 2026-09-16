# ชุดทดสอบก่อนนำเสนอ Share-Ed

ทุกไฟล์เน้น `GET` หรือการอ่านข้อมูล ยกเว้น `authenticated-smoke.js` ที่ Login ด้วยบัญชีทดสอบเท่านั้น สคริปต์ไม่มีการสร้าง แก้ไข ลบ ไลก์ บันทึก ติดตาม หรือคอมเมนต์

## เลือกไฟล์ให้ถูกงาน

| ไฟล์ | ใช้เมื่อ | สิ่งที่ทดสอบ |
|---|---|---|
| `smoke-test.js` | ทุกครั้งก่อนทดสอบใหญ่ | Home, posts, categories, profile และ Search data |
| `load-test.js` | ยืนยันโหลดทั่วไป 20 VUs | User journey แบบไม่ Login |
| `capacity-test.js` | วัดความพร้อมที่ 20, 50, 100 VUs | หน้า public หลักทั้งหมดและ API อ่านข้อมูล |
| `authenticated-smoke.js` | มีบัญชีทดสอบแล้ว | Login, ผู้ใช้ปัจจุบัน และ Post Detail |

## รันตามลำดับ

สร้างโฟลเดอร์เก็บผลครั้งแรกก่อน:

```cmd
mkdir results
```

```cmd
cd /d D:\LoadTestEye
k6 run smoke-test.js
k6 run load-test.js
k6 run -e MAX_VUS=20 --summary-export results\capacity-20-before.json capacity-test.js
k6 run -e MAX_VUS=50 --summary-export results\capacity-50-before.json capacity-test.js
k6 run -e MAX_VUS=100 --summary-export results\capacity-100-before.json capacity-test.js
```

รันทีละคำสั่ง ไม่ควรรันหลายหน้าต่างพร้อมกัน เพราะจะทำให้จำนวน VUs รวมเกินเป้าหมาย

หลังรันจบ k6 จะแสดงกล่องสรุปภาษาไทยอัตโนมัติใน Command Prompt และบันทึกข้อมูลเต็มไว้ที่ `results\latest-summary.json`

## เช็กว่า “ไวขึ้น” อย่างไร

1. รัน baseline ก่อนปรับโค้ด แล้วเก็บไฟล์ชื่อ `*-before.json`
2. ปรับระบบแล้วรันคำสั่งเดิม โดยเปลี่ยนชื่อเป็น `*-after.json`
3. เปรียบเทียบในผลสรุปของ k6 โดยใช้ระดับ VUs และช่วงเวลาทดสอบเท่าเดิม

| ค่า | ดีขึ้นเมื่อ |
|---|---|
| `http_req_duration p(95)` | ค่าน้อยลง |
| `journey_duration p(95)` | ค่าน้อยลง |
| `http_req_failed` | เท่าเดิมหรือลดลง และต้องต่ำกว่า 1% |
| `http_reqs/s` | สูงขึ้น โดย error ไม่เพิ่ม |
| `vus max` | ยังถึงเป้าหมายเดิม เช่น 50 หรือ 100 |

อย่าเทียบเฉพาะ `avg` เพราะค่าเฉลี่ยอาจดูดีแม้ผู้ใช้ส่วนหนึ่งเจอความช้า ให้ใช้ `p(95)` เป็นตัวหลัก

## เกณฑ์พร้อมนำเสนอ

- ทุก check ผ่าน และ `checks_failed` เป็น 0
- `http_req_failed` ต่ำกว่า 1%
- `http_req_duration p(95)` ต่ำกว่า 1 วินาที
- `journey_duration p(95)` ต่ำกว่า 5 วินาที
- ที่ 20, 50 และ 100 VUs ไม่มี `429`, `500`, `502`, `503` หรือ `504`
- หลังผ่าน 100 VUs ให้รัน `MAX_VUS=50` ต่อเนื่องอย่างน้อย 30 นาทีเพื่อตรวจว่าความเร็วไม่ค่อย ๆ ลดลง

## Login และหน้า protected

หน้า Post Detail ถูกส่งไป Login เมื่อยังไม่ยืนยันตัวตน จึงต้องใช้บัญชีทดสอบกับ `authenticated-smoke.js` เท่านั้น:

```cmd
set EMAIL=อีเมลบัญชีทดสอบ
set PASSWORD=รหัสผ่านบัญชีทดสอบ
set SUPABASE_ANON_KEY=public-client-key
k6 run authenticated-smoke.js
set EMAIL=
set PASSWORD=
set SUPABASE_ANON_KEY=
```

ห้ามใส่ข้อมูลรับรองไว้ในไฟล์หรือส่งในแชต และอย่าเพิ่ม VUs ของ Login ก่อนยืนยันกับผู้ดูแลระบบว่าอนุญาตให้ทดสอบโหลดระบบยืนยันตัวตน
