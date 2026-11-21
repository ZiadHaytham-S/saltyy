# Sallty: خطة التنفيذ خطوة بخطوة

> تحديث 11 أكتوبر 2026: [Regional account experience](regional-account-experience.md)

الحالة: Phase 1 إلى Phase 5 اتنفذوا. Phase 6 اتوافقت يوم 11 أكتوبر 2026 بنطاق Cart وGuest COD Checkout وإدارة الطلبات والشحن الثابت؛ التفاصيل والاختبارات في docs/orders.md. Phase 7 محتاجة موافقة منفصلة.

## Phase 1 — مراجعة وتخطيط

راجعنا الملفات الموجودة، حدّثنا architecture وهيكل المشروع وتصميم collections وعزل التجار وقواعد الميزانية والتواصل بالمصري. تكلفة التطوير المقترحة صفر اشتراكات باستخدام الأدوات المحلية؛ مفيش حسابات cloud اتعملت.

معيار الانتهاء: الملفات واضحة ومقروءة، مفيش database stack قديمة مقترحة، ومفيش claim إن فيه تطبيق شغال. الانتهاء من التخطيط مش موافقة تلقائية على التنفيذ.

## Phase 2 — Foundation: أول حاجة هنبنيها بعد إذنك

نجهز pnpm workspace وGit، apps/web بـ Next.js وapps/api بـ NestJS، TypeScript strict، lint/format، Tailwind v4 وshadcn/ui components الضرورية، وواجهة RTL بسيطة. نجهز MongoDB connection وlocal single-node replica set، health/readiness endpoints، .env.example وstartup validation، ونوثق أوامر التشغيل.

نراجع exact engines/peer dependencies لـ Next/React/Nest/@nestjs/mongoose/Mongoose/TypeScript قبل التثبيت. نختار MongoDB version متوافقة ونجرّب transaction فعلية. الأول نتأكد هل MongoDB tools أو Docker موجودين؛ Docker اختياري وبعد مراجعة ترخيصه، native MongoDB بديل محلي. مفيش خدمة cloud أو paid tool مطلوبين.

ليه نبدأ بالأساس؟ عشان نتأكد Frontend وAPI وdatabase بيتكلموا مع بعض، قبل ما نعتمد عليهم في تسجيل الحسابات والطلبات.

معايير القبول: install وdev startup وlint/typecheck/build ناجحين، API يتصل بـ database، smoke transaction تتعمل، failures لها errors آمنة، ولا secrets committed. نعمل index/validator scripts لما schemas تتضاف؛ التشغيل مش يعتمد على indexes اتعملت يدويًا. pnpm مش موجود في الفحص السابق، وأدوات MongoDB لسه متفحصتش.

بعد ملخص النتائج: نقف ونطلب موافقتك على Phase 3.

## Phase 3 — Authentication وإنشاء المتجر

تحديث 11 أكتوبر 2026: صاحب المشروع طلب OTP وNodemailer وتغيير الواجهة. تأكيد الإيميل اتضاف، مع أزرق/كحلي وخط Cairo وLogout في header؛ التفاصيل في docs/email-verification.md. السطر التالي بيسجل نطاق Phase 3 الأصلي قبل طلب التعديل.

Users/Sessions/Stores schemas وindexes، register/login/logout، password hashing، CSRF وrate limits، store creation وslug uniqueness، وحماية dashboard وownership-derived tenant context. طلب التنفيذ الحالي مفيهوش recovery/verification؛ اتأجلوا قبل النشر الحقيقي لمرحلة معتمدة، باستخدام وسيلة مناسبة متجربة، من غير خدمة email/SMS تلقائية.

معايير القبول: auth flow فعلي، revoked/expired sessions مرفوضة حتى لو TTL لسه ممسحتهاش، login abuse limits، forged storeId مش بيدي صلاحيات، concurrent slug requests ليها نتيجة واضحة، store ownership enforced. integration tests على real replica set، مفيش tokens/passwords في logs. نقف لموافقة المرحلة التالية.

## Phase 4 — لوحة التاجر والمنتجات

النطاق المعتمد يوم 11 أكتوبر: Product/Category Management فقط. صفحات products/category عربية للموبايل، create/edit/archive، search/status/category filters وpagination، local image storage بـ StorageAdapter، وأسعار بالقروش وسجل تغيير المخزون. Settings/publish وorders pages مؤجلة؛ مفيش storefront أو checkout أو payments أو cloud في المرحلة دي.

معايير القبول: create/edit/archive، ownership لكل association/upload/read/delete، stock integer غير سالب، EGP دقيق، RTL وkeyboard navigation. رفض foreign product/category/image IDs، strict validation وunique races، version conflicts، منع سباق حذف category/image مع ربطها. صور فعلية validated وreencoded WebP مع quotas وCSRF وrate limit. Unit/Integration/Security/Browser checks مع build/typecheck/lint. Local storage للتطوير فقط. نقف قبل Phase 5.

## Phase 5 — Public Storefront

النطاق المعتمد بدّل الخطة القديمة اللي كانت بتجمع العرض والطلبات: المرحلة دي عرض فقط، من غير Cart أو Checkout أو Orders. روابط `/store/[storeSlug]` وتفاصيل المنتجات، تصنيفات وبحث وفلاتر السعر وترتيب وPagination، صور عامة آمنة وSEO وRTL للموبايل. البيانات من NestJS وMongoDB الفعلية.

المنتج Active يظهر للعامة؛ Draft وArchived وصورهم مش متاحين. المتاجر الحالية لها رابط عام للاسم والكتالوج؛ مفيش نشر/إخفاء للمتجر كله أو رفع شعار في المرحلة دي. علامة الاسم بديل بصري مؤقت، وbranding مهيأة لإضافة الشعار واللون مستقبلًا. مفيش DNS أو Subdomains مفعلة.

معايير القبول:

- متجر موجود ومش موجود، تفاصيل منتج، Active فقط، عزل المتاجر والتصنيفات والصور.
- Query allowlist، أسعار صحيحة بالقروش، بحث حرفي مش regex مفتوح، Pagination محدودة.
- مفيش ownerId أو email أو phone أو SKU أو كمية مخزون دقيقة أو storage keys في Public DTO.
- تجربة متصفح حقيقية للبحث والفلاتر والصور والـ Metadata وRTL والموبايل.
- Build/TypeScript/Lint/Unit/Integration checks، والحسابات ولوحة التاجر القديمة لسه شغالة.

نقف بعد Phase 5 ونستنى موافقة المرحلة التالية؛ ده كتالوج عام محلي، مش رحلة بيع كاملة أو نشر تجاري.

## Phase 6 — Cart, Checkout & Order Management

النطاق اتوافق يوم 11 أكتوبر 2026: مراجعة الموجود وإكمال Cart وGuest Checkout مصري وCOD، وإعداد شحن ثابت، وطلبات التاجر بانتقالات محددة، وTransactions وIdempotency وstock audit ومنع Overselling وعزل المتاجر. شرح التنفيذ والتجربة في [orders.md](orders.md). مفيش Payment Gateway أو شحن خارجي أو عمولات أو Subscriptions أو DNS. نقف قبل Phase 7 ونستنى موافقة صاحب المشروع.

## تجهيز النشر — خطة منفصلة وموافقة

توسعة تصميم معتمدة 14 أكتوبر 2026: محرّر بصري ذاتي، ترتيب وإخفاء وإضافة أقسام ترويجية، مسودات خاصة ونشر منفصل ومعاينة فعلية محمية. التفاصيل في [visual-store-builder.md](visual-store-builder.md). لا تشمل وظائف أعمال إضافية أو تكاملات خارجية.

توسعة معتمدة 13 أكتوبر 2026: اختيار المنتج الملموس أو الرقمي، طلب رقمي بلا شحن، تسليم بعد تأكيد التاجر استلام المبلغ، وعشرة ثيمات ومحرّر تصميم وبيانات تواصل وفيديو محلي. التنفيذ والحدود في [digital-products-and-design.md](digital-products-and-design.md). تكامل PayPal والتحويل البنكي مؤجل بطلب صاحب المشروع.

Security review، dependency checks، SEO/performance/accessibility، persistent media storage، real recovery email، backups مع restore rehearsal، redacted logs، monitoring، staging وdeployment/rollback docs. هنراجع free-host limits وcommercial-use terms ومخاطر sleep/data loss، ونحدد تكلفة متوقعة قبل اختيار providers.

معايير القبول: critical tests/builds ناجحة، tenant isolation متراجع، backup restore فعلي، secrets وHTTPS/cookies وdatabase network access مضبوطين، upload quotas/storage جاهزين، سياسات دعم وخصوصية واضحة. من غير الحاجات دي منقولش production-ready.

ممنوع provision paid infrastructure أو خدمة محتاجة card من غير مناقشة وموافقة. مفيش تعديل GoDaddy DNS للدومين sallty.com غير بإذن صريح وبعد readiness.

## مرحلة مستقبلية مستقلة — Commissions

بعد موافقتك: configurable policy، auditable ledger، delivery/COD accrual، cancellation/refund reversals، manual adjustments، merchant statements وخطة collection/reconciliation. لا عمولة earned وقت إنشاء order ولا نسبة hardcoded. تصميم التفاصيل واختبار rounding/idempotency/refunds قبل التفعيل. الـ MVP الحالي بيحتفظ بالـ order snapshots اللي هتخدمها.

## طريقة الشغل والتعلّم

كل مرحلة لها scope واضح، تنفيذ صغير، checks مناسبة، تصليح verified failures، وشرح بالمصري: عملنا إيه، ليه، وظيفة الملفات، إزاي تجرب، والخطوة التالية. المصطلح الجديد يتشرح بمثال من Sallty. ما ننتقلش لمرحلة كبيرة تانية غير لما تقول ابدأ.

المؤجل: staff، variants، coupons، custom domains، payment/shipping integrations، WhatsApp notifications، multiple themes وadvanced analytics. الـ priorities تتححدد من تجربة MVP، مش من إضافة features عشان شكل المشروع.
