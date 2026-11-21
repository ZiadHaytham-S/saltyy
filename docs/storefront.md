# Phase 5 — المتجر العام

اتنفذت محليًا يوم 11 أكتوبر 2026 حسب النطاق المعتمد: عرض المنتجات فقط. مفيش Cart/Checkout/Orders/Payments أو Cloud أو DNS أو dependencies جديدة. Forgot Password مش ضمن التنفيذ ده ولسه ناقصة قبل الإطلاق.

## اللي اتبنى وليه

- `/store/[storeSlug]`: Navbar باسم المتجر وعلامة من أول حرف، Hero، تصنيفات، بحث، فلترة سعر بالجنيه، ترتيب بالأحدث والسعر، Product Cards وPagination وFooter.
- `/store/[storeSlug]/products/[productSlug]`: الصور، الوصف كنص عادي، السعر وسعر قبل الخصم وحالة المخزون والتصنيف. مفيش زر شراء وهمي.
- Server Components بتجيب من NestJS فقط؛ مفيش Mongoose أو credentials في Next.js، ومفيش session cookie بتتبعت في Public requests. النماذج GET تشتغل حتى من غير JavaScript.
- SEO Metadata بالاسم والوصف وCanonical وOpen Graph. صفحة المتجر وتفاصيل المنتجات قابلة للفهرسة؛ صفحات الفلاتر noindex/follow لتجنب تكرار النتائج. `SITE_URL` في web `.env.example` لعنوان النشر المستقبلي؛ الافتراضي محلي. ده إعداد Metadata مش تفعيل دومين.
- Loading Skeleton وError مع Retry وNot Found، وEmpty State للمتجر الفاضي أو البحث اللي ملوش نتائج.
- NestJS بيرجع 404 للمتجر/المنتج غير الموجود. Next.js ممكن يبدأ Streaming بالـ Loading ويرجع HTTP 200 قبل اكتشاف Not Found؛ وقتها الصفحة بتعرض 404 وNext بيضيف robots noindex. ده سلوك Next.js، واتغطّى باختبار عدم فهرسة المنتج المؤرشف؛ مفيش ادعاء إن كل Not Found في HTML statusها 404.
- صور Next.js هنا `unoptimized` عمدًا: الصور أصلًا validated/reencoded في Storage Adapter، وده يتجنب Image Optimizer cache اللي ممكن يفضل يعرض صورة منتج اتخفى. المتصفح بيطلب مسار الصورة المقيد بالمتجر وحالة المنتج، مع no-store.

الشعار المرفوع وتخصيص اللون مش موجودين في Phase 4. بدل اختراع شعار، الواجهة بتعرض علامة حرف الاسم. الـ Public Store DTO فيها `branding.logoUrl=null` و`primaryColor` الافتراضي؛ رفع شعار وتغيير لون لهما flow مستقل مستقبلًا. التصميم موحد حاليًا.

## قرار ظهور المتجر

مفيش publish flag للمتجر في schemas الحالية. بناءً على طلب المرحلة، المتجر الموجود له رابط عام، وProduct Active يظهر للعملاء حتى لو مخزونه صفر، مع «نفد المخزون». Draft وArchived مخفيين. Active هنا تصريح بالعرض، مش إمكانية شراء. لو محتاج إخفاء المتجر كله نضيف إعداد واضح في مرحلة معتمدة؛ مفيش تغيير بيانات التجار أو تحويل منتجات Draft تلقائيًا لـ Active.

## Public API والأمان

| المسار                                                           | وظيفته                                            |
| ---------------------------------------------------------------- | ------------------------------------------------- |
| `GET /public/stores/:slug`                                       | اسم وslug وbranding والتصنيفات العامة             |
| `GET /public/stores/:slug/products`                              | المنتجات Active مع search/filters/sort/pagination |
| `GET /public/stores/:slug/products/:productSlug`                 | تفاصيل Active من نفس المتجر                       |
| `GET /public/stores/:slug/products/:productSlug/images/:imageId` | WebP مرتبطة بالمنتج Active وفي نفس المتجر         |

المتصفح يستخدم نفس المسارات بعد `/api/v1` عبر Next.js rewrite. NestJS يحل slug لـ Store ID داخلي، وكل query وassociation والصور مقيدة بالمتجر. DTO يعني شكل الرد المسموح: مثال العميل يشوف «متوفر»، من غير كمية المخزون الداخلية أو SKU أو ownerId أو version أو email/phone. Image ID في رابط الصورة مش صلاحية لفتحها؛ السيرفر بيراجع علاقة المنتج بالصورة وحالة المنتج في كل طلب.

Query schema strict، ممنوع storeId/status/raw filters/operators/arrays. البحث في اسم المنتج حرفي وregex escaped وبحد 80 حرف. Category slug لازم يكون من نفس المتجر. API `minPrice/maxPrice` بالقروش الصحيحة؛ UI `minEGP/maxEGP` بالجنيه بتتحول باستخدام تقسيم النص لأرقام صحيحة من غير حساب مالي floating point. sort هو newest/price-asc/price-desc فقط. Page size ثابت 12، page من 1 لـ100. Store catalog محدود أصلًا بـ1000 منتج و200 تصنيف في Phase 4؛ full-text search وcursor pagination يتراجعوا عند توسع فعلي.

الـ indexes اتضافت للـ store/status/price وstore/status/category؛ slug unique per store موجود. الصور والتصنيفات بتتجاب batch لكل صفحة، مش query لكل منتج. Queries لها maxTimeMS=2000. البيانات والصور no-store لتجنب استمرار إظهار منتج اتأرشف؛ React cache يمنع تكرار طلب metadata/page داخل نفس render فقط. مفيش transactions لقراءات العرض؛ عمليّات تغيير المخزون القديمة لسه transactions.

Subdomains: مسارات الواجهة متجمعة في `storefront-routes.ts`، وBackend مستقل عن شكل الرابط وبيحل Store Slug. مستقبلًا host resolver موثوق يقدر يحدد slug ويدخل نفس الصفحات والخدمة، بعد مراجعة allowlist وTLS/DNS. مفيش middleware يقبل Host مزور أو subdomains مفعلة دلوقتي.

## الملفات المهمة

- `packages/contracts/src/storefront.ts`: Validation وPublic DTO contracts.
- `apps/api/src/modules/catalog/storefront.service.ts`: البيانات والعزل وإذن قراءة الصور.
- `apps/api/src/modules/catalog/storefront.controller.ts`: Public GET endpoints.
- `apps/web/src/lib/api/storefront.ts`: Server-only REST وقراءة فلاتر الجنيه.
- `apps/web/src/lib/storefront-routes.ts`: الروابط الموحدة.
- `apps/web/src/components/storefront.tsx`: Navbar/Footer/Product Cards والصور والأسعار.
- `apps/web/src/app/store/[storeSlug]/`: الصفحات والـ Metadata وحالات العرض.
- `apps/web/src/app/dashboard/page.tsx`: زر عرض المتجر والتوضيح الصحيح لحالة Active.
- `apps/api/test/storefront.test.ts` و`catalog.integration.test.mjs`: Validation وPublic isolation/image access.
- `scripts/auth-web-test.mjs`: رحلة عميل مجهول فعلية بجانب رحلة التاجر القديمة.

## التشغيل والتجربة

النتيجة: 11 Unit Tests و30 نتيجة Integration ناجحين، ورحلة Edge للمتجر العام والتاجر ناجحة. TypeScript وLint وBuild وformat:check ناجحين. اتراجعت صور الموبايل والكمبيوتر في `.local/test-artifacts/storefront-*.png`؛ الصور دي artifacts اختبار، مش صور أو بيانات ثابتة في واجهة التطبيق.

MongoDB local replica set لازم شغالة بنفس Phase 4. من جذر المشروع:

```powershell
.\pnpm.cmd dev
```

1. سجل دخول، افتح Dashboard واضغط «عرض المتجر». ممكن تدخل `/store/<storeSlug>` من متصفح تاني من غير login.
2. من المنتجات أضف منتج وسعر ومخزون وصورة، واختار Active. اعمل Refresh للمتجر؛ المنتج يظهر. Draft/Archived مش هيظهروا.
3. جرّب البحث والتصنيف والسعر من/لحد بالجنيه، والترتيب، وافتح تفاصيل المنتج وصوره. المخزون صفر يظهر «نفد المخزون».
4. أرشف المنتج وحدث الرابط العام؛ المنتج وصورته العامة يبقوا غير متاحين. الصور اللي نزلت عند عميل قبل الأرشفة مش ممكن نسحب نسخته منها.

```powershell
.\pnpm.cmd test
.\pnpm.cmd test:integration
.\pnpm.cmd test:web
.\pnpm.cmd typecheck
.\pnpm.cmd lint
.\pnpm.cmd build
.\pnpm.cmd format:check
```

الاختبارات اشتغلت على MongoDB replica set حقيقية بقواعد مؤقتة، SMTP محلي وEdge الحقيقي وproduction Next.js على ports منفصلة. مفيش بيانات عرض ثابتة في التطبيق؛ صور وبيانات الاختبارات fixtures مؤقتة بتتنضف. التغطية: active-only و404 وعزل المنتجات/التصنيفات/الصور وDTO وعدم تسريب البيانات، price sort/range/search/literal regex/pagination، وإخفاء الصورة بعد تغيير الحالة، وموبايل/RTL/Metadata والصورة والوصف النصي، والحسابات والكتالوج القديم.

محتاج تجربة يدوية بمنتجاتك وصورك الحقيقية، Safari/iOS وأجهزة أبطأ، وضغط بيانات أكبر قبل النشر. التخزين محلي للتطوير، مفيش load benchmark أو نشر تجاري أو DNS اتنفذ. المرحلة التالية تتحدد وتتوافق منفصلة؛ اقتراحها رحلة Cart/Checkout/Orders، مع معالجة recovery وتجهيز النشر قبل الإطلاق.
