# مشاركة البيانات إلى تيليجرام — Serverless relay

زر **"مشاركة البيانات"** في صفحة `#/admin` يرسل نسخة JSON من **دليل الخدمات**
إلى مجموعة تيليجرام كملف مرفق.

الموقع ثابت بالكامل (GitHub Pages) — لا يوجد سيرفر. ولهذا السبب **لا يمكن** وضع توكن البوت
في الكود الأمامي: أي زائر يقدر يقرأه ويستعمله. الحل: وسيط صغير (relay) يعمل على
Cloudflare Worker ويحتفظ بالتوكن كسرّ على السيرفر.

```
[المتصفح]  --(JSON فقط، بدون أسرار)-->  [Cloudflare Worker relay]  --(توكن على السيرفر)-->  [Telegram Bot API]
```

## سلوك الزر عند المستخدم

| الحالة | ما يراه المستخدم |
|---|---|
| أثناء الإرسال | الزر معطّل وعليه «جارٍ الإرسال…» |
| نجاح | `تمت مشاركة البيانات بنجاح ✓` — **ولا شيء آخر** |
| فشل | `تعذّرت مشاركة البيانات. حاول مرة أخرى.` |

لا يتم فتح تيليجرام، ولا تحويل المستخدم لأي مكان، ولا يظهر اسم تيليجرام أو
رابط المجموعة أو رقم المحادثة أو أي تفصيل تقني. التفاصيل التقنية تُطبع في
`console` فقط لمن يدير الموقع.

الملف `core.js` هو كل المنطق، و`worker.js` / `local-relay.js` مجرد محوّلات رقيقة —
فالاختبارات تشغّل نفس الكود الذي يُنشر فعليًا.

---

## ما تحتاج إعداده (خطوة واحدة فقط)

### 1) أنشئ بوت تيليجرام
1. افتح [@BotFather](https://t.me/BotFather) → `/newbot` → اختر اسمًا (مثال: `Anba Bishoy Backup Bot`).
2. انسخ **التوكن** الذي يظهر (شكله `123456789:AAE...`).

### 2) أضف البوت إلى المجموعة
- افتح مجموعة `https://t.me/+k59GS-Gk3x82ZWJk` → *إضافة أعضاء* → أضف البوت.
- اجعله **مسؤول (Admin)** مع صلاحية *نشر الرسائل* على الأقل، أو فعّل
  "السماح للأعضاء بإرسال الوسائط" — البوت يحتاج صلاحية إرسال ملفات.

### 3) اعرف رقم المجموعة (`chat_id`)
بعد إضافة البوت، أرسل أي رسالة في المجموعة، ثم:

```bash
curl -s "https://api.telegram.org/bot<TOKEN>/getUpdates" \
  | python3 -c "import sys,json;[print(u['message']['chat']['id'], u['message']['chat'].get('title')) for u in json.load(sys.stdin)['result'] if u.get('message')]"
```

الرقم يبدأ عادة بـ `-100…`.

> ملاحظة: إن كانت المجموعة "مجموعة عامة/قناة" فرقمها ثابت. لو نقلت المجموعة إلى
> supergroup سيتغير الرقم، فأعِد الخطوة.

### 4) انشر الوسيط على Cloudflare (مجاني)
```bash
cd telegram-relay
npm i -g wrangler          # أو استعمل npx wrangler
wrangler login

# الأسرار — تُخزَّن مشفَّرة ولا تدخل المستودع إطلاقًا:
wrangler secret put TELEGRAM_BOT_TOKEN
wrangler secret put TELEGRAM_CHAT_ID

wrangler deploy
```

سيطبع عنوانًا مثل:
`https://anba-bishoy-telegram-relay.<your-subdomain>.workers.dev`

### 5) ضع العنوان في `app.js`
في أعلى قسم "مشاركة البيانات" في `app.js`:

```js
const TELEGRAM_RELAY_ENDPOINT =
  'https://anba-bishoy-telegram-relay.<your-subdomain>.workers.dev/api/telegram/share';
```

يمكن أيضًا تجاوزه بدون تعديل الملف، بوضع هذا قبل `<script src="app.js">` في `index.html`:

```html
<script>window.TELEGRAM_SHARE_CONFIG = { endpoint: 'https://.../api/telegram/share' };</script>
```

### 6) تحقّق
```bash
curl -s https://anba-bishoy-telegram-relay.<your-subdomain>.workers.dev/api/telegram/health
# => {"ok":true,"configured":true,...}
```

---

## التشغيل محليًا (بدون نشر)

```bash
cd telegram-relay
cp .dev.vars.example .dev.vars      # ثم ضع التوكن ورقم المجموعة
set -a && . ./.dev.vars && set +a
PORT=8787 node local-relay.js
```

ثم في `index.html` (أو الكونسول قبل تحميل الصفحة):
```js
window.TELEGRAM_SHARE_CONFIG = { endpoint: 'http://127.0.0.1:8787/api/telegram/share' };
```

---

## الاختبارات

```bash
cd telegram-relay
npm i -D playwright && npx playwright install chromium   # مرة واحدة، لاختبار المتصفح

node --test test/relay.test.mjs   # 15 اختبارًا للوسيط مقابل Telegram Bot API وهمي
node test/e2e.test.mjs            # 17 فحصًا في متصفح Chromium حقيقي على صفحة #/admin

# الرفع الفعلي إلى تيليجرام (يحتاج توكنًا حقيقيًا):
export TELEGRAM_BOT_TOKEN='123456789:AAE...'
export TELEGRAM_CHAT_ID='-1001234567890'
node test/real-telegram-upload.mjs
```

`real-telegram-upload.mjs` يشغّل المتصفح الحقيقي على ملفات المستودع الحقيقية،
يضغط الزر فعليًا، ثم **يُنزّل الملف نفسه من تيليجرام** عن طريق `getFile`
ويتأكد أنه JSON صالح يحتوي كل السجلات — أي أنه يثبت الرفع من الطرفين.

### متغيرات البيئة الاختيارية

| المتغير | الافتراضي | الوظيفة |
|---|---|---|
| `TELEGRAM_API_BASE` | `https://api.telegram.org` | للاختبار فقط |
| `ALLOWED_ORIGINS` | `https://fadiramzy.github.io` + localhost | قائمة Origins المسموحة |
| `MAX_JSON_BYTES` | `4194304` (4 م.ب) | أقصى حجم للـ JSON |
| `RATE_LIMIT_PER_MINUTE` | `10` | حد الطلبات لكل IP في الدقيقة |
| `RELAY_ACCESS_KEY` | — | مفتاح إضافي في الهيدر `X-Relay-Key` |

---

## الأمان

| البند | الحالة |
|---|---|
| توكن البوت في المستودع | ❌ غير موجود — سرّ على Cloudflare فقط |
| توكن البوت في الكود الأمامي | ❌ المتصفح لا يعرفه إطلاقًا |
| توكن البوت في الردود/اللوجات | ❌ لا يُعاد ولا يُطبع |
| ما يمكن للوسيط فعله | إرسال **ملف واحد** إلى **chat_id ثابت** — لا قراءة، لا حذف، لا رسائل أخرى |
| قيود على الحمولة | JSON فقط، يجب أن يكون مصفوفة كائنات، حد أقصى 4 م.ب |
| `Origin` | مسموح فقط لـ `https://fadiramzy.github.io` (+ localhost للتطوير) |
| `RELAY_ACCESS_KEY` | اختياري — مفتاح إضافي في الهيدر `X-Relay-Key` |
| Rate limiting | 10 طلبات/دقيقة لكل IP (`RATE_LIMIT_PER_MINUTE`) + `Retry-After` |

> ملاحظة: الوسيط عام بالضرورة (لأن الموقع عام)، لذلك أسوأ ما يستطيع مهاجم فعله
> هو إرسال ملفات JSON إضافية إلى المجموعة. إن أردت منع ذلك تمامًا فعّل
> `RELAY_ACCESS_KEY` **واعلم أنه سيظهر في الكود الأمامي**، أو اجعل زر المشاركة
> خلف قفل الإدارة (PIN) كما هو مقترح في `app.js`.
