# Sallty (سلتي)

تحديث 14 أكتوبر 2026: [محرّر المتجر البصري](docs/visual-store-builder.md) داخل `/dashboard/design`، مع إضافة وترتيب وإخفاء الأقسام، حفظ المسودة والنشر، ومعاينة فعلية خاصة في `/dashboard/design/preview`.

تحديث 13 أكتوبر 2026: [المنتجات الرقمية والثيمات والتخصيص](docs/digital-products-and-design.md). نوع المنتج من نموذج المنتجات، تصميم المتجر من `/dashboard/design`، وتأكيد المبلغ والتسليم الرقمي من تفاصيل الطلب. لا يوجد تكامل دفع إلكتروني مفعل.

> تحديث 11 أكتوبر 2026: [Regional account experience](docs/regional-account-experience.md)

حسابات التجار والكتالوج وPublic Storefront والسلة وGuest Checkout المصري وطلبات COD تعمل محليًا باستخدام Next.js + NestJS + MongoDB/Mongoose. الواجهة عربية فصحى وإنجليزية مع RTL/LTR وLight/Dark، والحسابات والكتالوج يدعمان الدول العربية الـ22. Payments والنشر والتكاملات الخارجية مؤجلة. شرح Phase 6 في [docs/orders.md](docs/orders.md).

افتح متجر من زر «عرض المتجر» في Dashboard، أو `http://127.0.0.1:3000/store/STORE-SLUG`. منتجات Active بس هي اللي بتظهر. تفاصيل التنفيذ والتجربة في [docs/storefront.md](docs/storefront.md).

## محتاج إيه؟

- Node.js 24 LTS؛ المشروع محدد 24.15 أو أحدث داخل 24.x. [الموقع الرسمي](https://nodejs.org/en/download).
- pnpm 12.10.1. موجود محليًا داخل .tools على الجهاز ده. [توثيق pnpm](https://pnpm.io/installation).
- MongoDB Community Server؛ اتجربت نسخة 9.0.2 على الجهاز ده. [التنزيل الرسمي](https://www.mongodb.com/try/download/community).
- mongosh/Compass اختياريين؛ أوامر تهيئة Replica Set هنا بتستخدم Mongoose، فمش مطلوب Docker أو cloud account.

لو واخد نسخة جديدة من المشروع ومفيش pnpm، تقدر تنزله محليًا من غير global install:

```powershell
npm.cmd install --prefix .tools pnpm@12.10.1 --no-audit --no-fund
```

في PowerShell استخدم `.\pnpm.cmd` من جذر المشروع؛ ده launcher للنسخة المحلية. لو pnpm متثبتة عندك global، `pnpm.cmd` بديل. استخدام `.cmd` بيتفادى منع ملفات `.ps1` من غير تغيير Execution Policy. `.tools` والـ caches مش بيتضافوا لـ Git.

## أول تشغيل

من `D:\sallty`:

```powershell
.\pnpm.cmd install --frozen-lockfile
.\pnpm.cmd setup:env
.\pnpm.cmd db:start
```

سيب terminal الداتا بيز مفتوح. السكريبت بيلاقي MongoDB في Program Files تلقائيًا على Windows، وبيستخدم folder منفصل `.local/mongodb/data`. لو مش لاقي executable، حدد مساره قبل db:start:

```powershell
$env:MONGOD_PATH = 'C:\Program Files\MongoDB\Server\9.0\bin\mongod.exe'
.\pnpm.cmd db:start
```

في terminal تاني، أول مرة بس:

```powershell
.\pnpm.cmd db:init
.\pnpm.cmd db:check
```

`db:init` تهيئة آمنة متكررة لنفس `rs0`. ممكن تحتاج تستنى ثواني بعد التهيئة عشان primary تبقى جاهزة ثم تعيد `db:check`. السكريبت مش بيحوّل database service موجودة أو يعدّل بياناتها؛ لو فيه service شغالة على 27017 هيتعارض الـ port. راجع إعدادها الأول بدل إيقافها تلقائيًا.

Replica Set هنا node واحدة، بتسمح بـ Transactions لكن مش بتوفر redundancy. `db:check` بيجرّب commit وrollback حقيقيين في collection اسمها `_foundationChecks`، وبيمسح documents الاختبار اللي عملها؛ collection/index ممكن يفضلوا موجودين وفاضيين.

MongoDB المحلية مربوطـة بـ 127.0.0.1 من غير authentication للتطوير فقط. متفتحش port 27017 للإنترنت، ومتستخدمش الإعداد ده production.

بعدها:

```powershell
.\pnpm.cmd dev
```

- الصفحة: http://127.0.0.1:3000
- حالة السيرفر: http://127.0.0.1:4000/health
- جاهزية MongoDB: http://127.0.0.1:4000/ready
- نفس health من خلال Next.js: http://127.0.0.1:3000/api/v1/health

`dev` بيشغّل Frontend وBackend مع بعض. `dev:web` و`dev:api` لتشغيل كل واحد لوحده. Ctrl+C لإيقافهم؛ MongoDB في terminal منفصل. لو اتصال API الأولي فشل لأن MongoDB كانت مقفولة، شغّل MongoDB وأعد تشغيل API؛ `/health` بتفضل متاحة و`/ready` بتوضح عدم الجاهزية.

## إعدادات البيئة

`apps/api/.env.example` فيه API_HOST وAPI_PORT وMONGODB_URI وNODE_ENV وAPP_ORIGIN وCSRF_SECRET فارغة. `setup:env` يحافظ على إعداداتك ويولّد مفتاح CSRF عشوائي محلي لو ناقص، من غير طباعة قيمته. `apps/web/.env.example` فيه API_INTERNAL_URL وNEXT_TELEMETRY_DISABLED. `.env` مستبعدة من Git.

استخدم http://127.0.0.1:3000 بالضبط محليًا، لأن APP_ORIGIN بيتحقق من مصدر طلبات الكتابة. لو غيّرت port الواجهة حدّث APP_ORIGIN في API وأعد تشغيلها. بعد التحديث من Phase 2 شغّل setup:env، وبعدها أعد تشغيل dev اللي كان شغّال علشان يحمل الكود وإعدادات الأمان الجديدة.

Next.js بيتواصل مع NestJS بطريقتين: الصفحة Server Component بتطلب health/readiness على السيرفر، وrewrite بيحوّل `/api/v1/*` إلى NestJS من نفس origin للمتصفح. تغيير API port محتاج تحديث API_INTERNAL_URL، ومع production لازم إعادة build لأن rewrites بتتسجل وقت build.

## إزاي تتأكد؟

```powershell
.\pnpm.cmd typecheck
.\pnpm.cmd lint
.\pnpm.cmd test
.\pnpm.cmd test:integration
.\pnpm.cmd test:web
.\pnpm.cmd build
.\pnpm.cmd test:smoke
.\pnpm.cmd format:check
```

Typecheck بيكشف أخطاء types. Build بيطلع نسخة قابلة للتشغيل. `test` بيختبر رفض config غلط من غير كشف قيمها. `test:smoke` بيشغّل production web/API، ويتأكد من health وreadiness والصفحة العربية والـ rewrite وحالة API outage، وبعدين يوقف processes اللي شغّلها. محتاج MongoDB جاهزة وports 3000/4000 فاضيين؛ اقفل dev قبل تشغيله. اختبار الـ Transaction منفصل في `db:check`.

## وظيفة الملفات المهمة

- `pnpm-workspace.yaml`: بيجمع apps وpackages ويخلّي dependency checks صارمة.
- `package.json`: أوامر التشغيل والفحص والإصدارات المطلوبة؛ `pnpm-lock.yaml` بيثبت dependency tree عشان install تتكرر.
- `packages/config`: TypeScript strict وقواعد lint المشتركة.
- `apps/web/src/app/layout.tsx`: لغة الصفحة واتجاه RTL وmetadata.
- `apps/web/src/app/page.tsx`: تعريف بالإمكانيات للزائر، وتحويل صاحب الجلسة للـ Dashboard أو تأكيد الإيميل.
- `apps/web/src/components/ui/button.tsx` و`components.json`: بداية shadcn/ui محلية قابلة للتعديل؛ مش محتاج مكتبة components ضخمة.
- `apps/web/src/app/globals.css`: Tailwind v4 وألوان الواجهة.
- `apps/web/src/lib/api/health.ts`: اتصال server-side بالـ API مع timeout ورسالة unavailable بدل crash.
- `apps/web/next.config.ts`: rewrite بين Next وNest.
- `apps/api/src/main.ts`: تشغيل NestJS على loopback وإغلاقه عند shutdown.
- `apps/api/src/app.module.ts`: تجميع modules وإعداد Mongoose connection.
- `apps/api/src/config/env.ts`: التحقق من env قبل التشغيل؛ مبيطبعش قيم ممكن تكون سرية.
- `apps/api/src/health/health.controller.ts`: `/health` للسيرفر و`/ready` للـ database/replica set.
- `apps/api/tsconfig.json`: NodeNext/ESM وإعدادات decorators الخاصة بـ NestJS.
- `apps/api/scripts`: تشغيل MongoDB محليًا، وتهيئة replica set واختبار transactions وdev watch.
- `docs/architecture.md` و`docs/roadmap.md`: قرارات التصميم وترتيب المراحل.

اختيار الإصدارات كان بالتوافق، مش أعلى رقم فقط: TypeScript 6 لأن lint tooling لسه مش بيدعم 7؛ ESLint 9 لأن Next lint plugins لسه مش بتدعم 10. pnpm بيحافظ على strict peer checks. أي upgrade لاحق يتراجع ويتجرب؛ free tools مش وعد باستضافة مجانية دائمة.

## تجربة الحساب والمتجر

تحديث Phase 3: بعد Register، أكد الإيميل في `/verify-email` بكود 6 أرقام صالح 10 دقايق، ثم إنشاء المتجر. الحساب الموجود يطلب كود جديد ويحتفظ بمتجره. Nodemailer يستخدم Gmail App Password من apps/api/.env فقط؛ CLIENT_ID مش مطلوب. بعد تعديل .env أعد تشغيل API. زر Logout ظاهر في header، والتصميم أزرق/Cairo. إعداد الإرسال وحدود Gmail ونتائج الاختبارات في [docs/email-verification.md](docs/email-verification.md).

1. افتح `/register`، واختر دولتك، وأدخل اسمك وبريدك الإلكتروني ورقم هاتف صالحًا للدولة المختارة وكلمة مرور لا تقل عن 12 حرفًا.
2. بعد التسجيل أكد إيميلك في `/verify-email`، ثم `/onboarding/store`: اسم عربي وslug زي `nour-shop`. كل تاجر له متجر واحد حاليًا، والـ slug فريد وثابت.
3. `/dashboard` تعرض اسم التاجر والمتجر وتسمح بتعديل اسم المتجر والخروج.
4. `/login` للدخول تاني. الزائر مش بيدخل Dashboard، وصلاحيات المتجر بيتحقق منها NestJS في كل طلب.

`test:integration` فيه اختبارات auth/permissions/CSRF/rate limits/unique races على database مؤقتة في MongoDB replica set حقيقية. `test:web` يبني نسخة production منفصلة في `.next-auth-test` ويشغّل API وNext على ports عشوائية؛ يختبر SSR والـ proxy، ثم رحلة فعلية بـ Playwright داخل Edge headless. الاختبار يمسح database اللي أنشأها فقط، ومبيوقفش dev بتاعك. صور الاختبار موجودة في `.local/test-artifacts` ومستبعدة من Git.

على Windows الاختبار بيستخدم Edge الموجود؛ [رابطه الرسمي](https://www.microsoft.com/edge/download). تقدر تختار متصفح موجود بـ `$env:PLAYWRIGHT_CHANNEL = 'chrome'`. على Linux/macOS تحتاج Chromium الخاص بـ Playwright: `pnpm --filter @sallty/web exec playwright install chromium`، وده تنزيل مجاني محلي. [توثيق المتصفحات](https://playwright.dev/docs/browsers). مفيش cloud testing أو اشتراك.

أهم ملفات Phase 3:

- `packages/contracts/src/index.ts`: Zod schemas مشتركة للتحقق في الواجهة والـ API، والـ DTOs اللي بتحدد البيانات المسموح ترجع.
- `apps/api/src/database/schemas.ts`: User/Session/Store/RateLimitBucket وunique/TTL indexes.
- `apps/api/src/modules/auth`: Argon2id وتسجيل الحساب والدخول والخروج والجلسات.
- `apps/api/src/security`: Guards وCookies وCSRF وrate limits.
- `apps/api/src/modules/stores`: إنشاء/قراءة/تعديل متجر صاحب الـ Session فقط.
- `apps/web/src/lib/api/merchant.ts`: جلب البيانات على السيرفر باستخدام Cookie، من غير وصول Next.js لـ MongoDB.
- `apps/web/src/lib/api/client.ts`: طلبات الفورم من نفس origin ومعاها CSRF token؛ مفيش localStorage tokens.
- `apps/web/src/components/merchant-form.tsx`: فورم التسجيل والدخول والمتجر، ورسائل الخطأ وحالة الانتظار.
- `apps/web/src/app/register`, `login`, `onboarding/store`, `dashboard`: صفحات Server Components؛ التفاعل بس Client Components.
- `apps/api/test/auth.integration.test.mjs` و`scripts/auth-web-test.mjs`: اختبارات الحماية ورحلة المتصفح.

نتائج Phase 2 في [docs/foundation.md](docs/foundation.md)، وشرح Phase 3 في [docs/authentication.md](docs/authentication.md)، وOTP في [docs/email-verification.md](docs/email-verification.md). استعادة كلمة المرور نُفذت عبر Nodemailer، وتأكيد الهاتف ما زال مؤجلًا. شرح دعم الدول واللغة والمظهر والصلاحيات في [docs/regional-account-experience.md](docs/regional-account-experience.md). لم يتغير DNS.

## المنتجات والتصنيفات — Phase 4

من Dashboard افتح «التصنيفات» لإضافة اسم وSlug، ثم «المنتجات» ← «إضافة منتج». أدخل السعر بعملة متجرك، والمخزون كعدد صحيح، واختر الحالة والصور والتصنيف. Slug وSKU فريدان داخل متجرك فقط. البحث والفلاتر والتنقل بين الصفحات متاحة في قائمة المنتجات.

«تعديل» يفتح كل بيانات المنتج. «أرشفة المنتج» هي الحذف الآمن؛ البيانات محفوظة وممكن ترجّعه بحالة «نشط». حذف التصنيف المستخدم مرفوض لحد ما تفصله من كل المنتجات، حتى المؤرشفة.

ارفع JPEG/PNG/WebP من الفورم بحد 5 MB للصورة و8 صور للمنتج. السيرفر يتحقق من المحتوى ويحوله WebP، والصور محفوظة في `.local/uploads` خارج public. الرفع مستقل عن حفظ المنتج؛ الصور غير المرتبطة موجودة في المكتبة وتقدر تحذفها بعد التأكيد. حد المكتبة 50 صورة و100 MB لكل متجر، و30 محاولة رفع في الساعة. الصور محمية بنفس Session، مش روابط عامة للعملاء.

`test` يشمل قواعد الأسعار والبيانات والصور والتخزين. `test:integration` يشمل Authentication واختبارات Catalog على MongoDB حقيقية. `test:web` يشمل رحلة منتجات وتصنيفات ورفع صور داخل Edge. كل اختبار يستخدم database مؤقتة، والصور المؤقتة للاختبار بتتنضف، وصور الشاشة في `.local/test-artifacts`.

وظيفة الملفات وقرارات الحماية ونتائج الاختبارات بالتفصيل في [docs/catalog.md](docs/catalog.md). Phase 5 اتنفذت، وتفاصيل المتجر العام في [docs/storefront.md](docs/storefront.md). مفيش خدمة مدفوعة أو cloud اتضافت.

مراجعة رحلة التاجر: الصفحة الرئيسية تميّز المسجل، Dashboard فيها أعداد كتالوج حقيقية وأزرار إدارة، وتعديل الاسم في قسم منفصل مع تأكيد حفظ. تفاصيل الإصلاح والنواقص قبل إطلاق السوق في [docs/application-review.md](docs/application-review.md).

## السلة والطلبات — Phase 6

لو مش عارف تبدأ منين، افتح Dashboard → «دليل الاستخدام» في `/dashboard/help`. الصفحة بتشرح رحلة كاملة بأزرار مباشرة. الملخص يعرض خطوات تجهيز متجرك حسب البيانات الفعلية، والمزايا غير المنفذة موجودة تحت «مزايا مخطط لها». شرح مراجعة الواجهة في [docs/usability-review.md](docs/usability-review.md).

من Dashboard → الشحن احفظ رسومًا ثابتة بالجنيه، أو صفرًا للشحن المجاني. الإعداد يبدأ فارغًا، وCheckout لا تعمل قبل حفظه. Checkout الحالية للمتاجر المصرية بعملة EGP فقط؛ دعم الحسابات والكتالوج للدول العربية محفوظ.

افتح `/store/STORE-SLUG` كعميل، أضف منتجًا Active للسلة، وعدّل الكمية ثم أكمل الطلب ببيانات مصرية. السلة محفوظة لكل متجر منفصلًا، وGuest Checkout لا تحتاج حسابًا. الدفع عند الاستلام فقط. التأكيد يعرض الرقم والحالة من غير بيانات العميل.

من `/dashboard/orders` ابحث وصفِّ الطلبات وافتح التفاصيل. الحالات: بانتظار التأكيد → مؤكد → قيد التجهيز → تم الشحن → تم التسليم. الإلغاء قبل الشحن فقط ويرجع المخزون مرة واحدة. الطلبات المعلقة تحتاج متابعة التاجر، ولا تُلغى تلقائيًا.

NestJS يحسب الأسعار بالقروش من MongoDB ويحفظ Snapshot لا تتغير بتعديل المنتج لاحقًا. Order والمخزون والسجل يتحفظوا في Transaction واحدة. Idempotency تمنع تكرار الأوردر بنفس مفتاح المحاولة، بما فيه انقطاع الاتصال بعد الحفظ. شرح الملفات والاختبارات وحدود التجربة في [docs/orders.md](docs/orders.md). Phase 7 لم تبدأ.
