# Phase 3: قرارات الأمان قبل التنفيذ

تحديث: تأكيد الإيميل اللي كان مؤجل في الوصف الأصلي تحت اتطلب واتنفذ يوم 11 أكتوبر 2026. الوضع الحالي ونتائج الإرسال والتصميم في [email-verification.md](email-verification.md)؛ password recovery وتأكيد الموبايل لسه مؤجلين.

Phase 3 اتوافقت يوم 10 أكتوبر 2026. النطاق: register/login/logout، store onboarding، dashboard تعريفية محمية، وتعديل اسم المتجر فقط. Products/Orders وأي cloud integrations خارج المرحلة.

- Secure Sessions بدل JWT: token عشوائي في HttpOnly cookie، والـ database تخزن SHA-256 hash بس. logout يبطل الجلسة فورًا، وده أبسط من refresh tokens وJWT revocation في المشروع ده.
- Argon2id هو password hashing مش تشفير قابل للفك. اختيار البداية 19 MiB memory و2 iterations وparallelism 1، مع salt عشوائي من المكتبة. [OWASP Password Storage](https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html). نقيس الأداء قبل النشر.
- الجلسة: 7 أيام absolute و24 ساعة idle، يتحقق منهم API قبل كل طلب. TTL index تنظيف بس، مش إذن للدخول. login/register يدوروا token ويبطلوا الجلسة السابقة في نفس browser.
- production cookies: Secure + HttpOnly + SameSite=Lax + Path=/ ومن غير Domain، وأسماء __Host-. Local HTTP له أسماء development واضحة؛ إعداداته مش إعداد production.
- CSRF: signed double-submit token مرتبط بالـ session، مع nonce في HttpOnly cookie وHMAC key من env. الـ UI تطلب token قبل أي mutation وتحطه في header، مش localStorage. Origin لازم يطابق APP_ORIGIN، وطلبات الكتابة JSON فقط. [OWASP CSRF](https://cheatsheetseries.owasp.org/cheatsheets/Cross-Site_Request_Forgery_Prevention_Cheat_Sheet.html).
- مفيش CORS خارجي؛ الاتصال browser من نفس origin عبر Next rewrite. الـ API مبيثقش في forwarded IP headers. محليًا Next proxy بيجمع الطلبات تحت IP loopback؛ الـ limits محافظة، ومعاها limits مستقلة لكل login email. نشر عام يحتاج تصميم trusted proxy قبل أي real merchants.
- MongoDB unique indexes فعلية للـ normalized email وStore.ownerId وslug، وTTL للجلسات/limits. auth routes تفشل بأمان لو database أو indexes مش جاهزين. ممنوع الاعتماد على Mongoose unique كـ validation.
- Auth Guard يستخرج user من جلسة فعلية؛ Store service يفلتر ownerId مع resource ID في نفس query. Browser ownerId/storeId عمرهم ما يمنحوا صلاحية. تعديل slug أو owner ممنوع في المرحلة دي.
- Transaction لـ User+Session عند التسجيل ولتدوير session عند login؛ hashing خارج transaction. إنشاء Store أو تعديل اسمه single-document writes، فمش محتاجين transaction.
- CSRF_SECRET تتولد محليًا بـ setup:env من crypto.randomBytes وتتكتب في .env المتجاهلة؛ مش هنطبعها أو نضيف secret جاهزة للكود.
- email/mobile format validation مش إثبات ملكية. Email verification/password recovery مش ضمن طلب المرحلة الحالي، ومؤجلين قبل public launch؛ مفيش email/SMS service أو fake verification.
- integration tests تستخدم database مؤقتة منفصلة وports منفصلة، وتختبر HTTP APIs، indexes، revocation/expiry، CSRF/CORS، rate limits، وطلبات تاجر A على متجر B. لا fixtures في development database.

## اللي اتنفذ وإزاي تفهمه

المتصفح بيبعت register/login عبر `/api/v1` في Next.js. NestJS يتحقق من Zod وOrigin وCSRF والـ rate limits، ويعمل Argon2id hash لكلمة المرور. بعد النجاح يبعت session cookie؛ JavaScript مش تقدر تقراها. في كل طلب محمي AuthGuard يتحقق من الجلسة في MongoDB، وStore service يضيف ownerId من الجلسة للـ query.

Session يعني جلسة دخول: زي تصريح عشوائي يربط المتصفح بأحمد. قاعدة البيانات بتخزن بصمة التصريح بس، وlogout بيمسحه فورًا. JWT كان هيحتاج سياسة إضافية لإلغاء التصاريح قبل انتهاء مدتها؛ sessions أبسط لمرحلتنا. Hashing مش تشفير قابل للفك: بنقارن كلمة المرور بالبصمة من غير استرجاع كلمة المرور الأصلية.

CSRF يعني موقع تاني يحاول يعمل تعديل باستخدام جلسة التاجر. بنطلب token موقّع مربوط بالجلسة وOrigin صحيح؛ Cookie لوحدها مش كفاية للتعديل. Guard هو بوابة قبل الـ controller: الطلب المرفوض مش بيوصل لقواعد الشغل.

DTO هو شكل الرد المسموح: `/auth/me` يرجع id/name/email/phone لصاحب الحساب فقط، وStore يرجع id/name/slug. مفيش passwordHash أو session token في JSON، والردود `no-store`. Unique index هو قاعدة داخل MongoDB تمنع طلبين متزامنين من تسجيل نفس الإيميل أو slug.

التسجيل بينشئ User+Session في transaction. إنشاء المتجر خطوة مستقلة بعده؛ لو التاجر قفل المتصفح قبل الإنشاء، login/dashboard يرجعه لصفحة onboarding. إنشاء متجر واحد document واحدة، مش محتاج transaction. متاجر التجار التانيين ترجع 404 للقراءة والتعديل.

## أوامر التجربة والتحقق

```powershell
.\pnpm.cmd setup:env
.\pnpm.cmd dev
```

MongoDB rs0 لازم تكون شغالة؛ `db:start` و`db:init` لأول تشغيل، و`db:check` للتحقق من transactions. لو dev كان شغال من Phase 2، أوقفه بنفسك وأعد تشغيله بعد setup:env. مفيش برنامج إضافي مطلوب على الجهاز الحالي؛ Edge وMongoDB وNode موجودين.

افتح http://127.0.0.1:3000/register، ثم اسم المتجر والـ slug، وبعدها Dashboard. التسجيل يقبل 010/011/012/015 أو +20، ويحوّل الأرقام العربية للصيغة الموحدة. اسم متجر عربي، slug إنجليزي فريد 3–50 حرف، وكلمة مرور 12–128 حرف. الإيميل بيتحوّل lowercase؛ صحة الشكل مش verification.

```powershell
.\pnpm.cmd typecheck
.\pnpm.cmd lint
.\pnpm.cmd test
.\pnpm.cmd test:integration
.\pnpm.cmd test:web
.\pnpm.cmd build
.\pnpm.cmd format:check
```

## نتائج الاختبار وحدوده

التحقق النهائي: Build وTypeScript وLint وformat:check نجحوا، وinstall --frozen-lockfile --offline نجح. اختبارات config: 2/2، واختبارات Backend: 13/13 مع الـ parent test، واختبار Next.js/Edge نجح. `test:smoke` القديم اتجرب فعلًا وفشل بـ EADDRINUSE لأن port 4000 مستخدمة؛ مفيش process لصاحب المشروع اتوقفت.

- اختبارات Backend على MongoDB replica set محلية فعلية: validation وNoSQL injection، Argon2id، HttpOnly، duplicate-email race وrollback، CSRF وOrigin/CORS، slug race وowner uniqueness، منع تاجر A من GET/PATCH متجر B، رفض ownerId/storeId وslug edits، session rotation وexpiry وidle/logout، rate limits بعد restart ورفض spoofed IP، malformed/oversized JSON، production Secure/__Host cookies، ورفض auth لما database مش متاحة.
- Next.js production test: redirects قبل HTML، صفحات RTL وServer Components، proxy وCookies، إنشاء/تعديل المتجر وعزله، logout وlogin. API وWeb على ports عشوائية؛ قواعد البيانات المؤقتة منفصلة وبتمسح بعد الاختبار.
- Playwright على Edge headless حقيقي: register/onboarding/edit/logout/wrong-password/login من الفورم. اتفحص عدم ظهور Tokens في localStorage وعدم وصول document.cookie للـ HttpOnly cookies وعدم وجود horizontal overflow على 390px، ومفيش JavaScript errors. صور Dashboard على mobile/desktop اتراجعت بصريًا وموجودة في `.local/test-artifacts` فقط.
- اختبار production cookies بيختبر Set-Cookie flags والـ deletion عبر HTTP client محلي؛ مفيش TLS deployment اتعمل. التشغيل المحلي HTTP مقصود، وpublic launch يحتاج HTTPS ومراجعة proxy وإعدادات الشبكة.
- مراجعة يدوية لسه مطلوبة على موبايل حقيقي وSafari/Firefox ومع screen reader/password manager. اختبارات Edge مش بديل عن تجربة كل المتصفحات أو penetration test مستقل.
- سكريبت `test:smoke` القديم بتاع Foundation يحتاج ports 3000/4000 فاضيين. مش هنقفل dev بتاع صاحب المشروع علشانه؛ `test:web` الجديد يغطي production integration على ports مستقلة، وdatabase outage متغطي في Backend tests.

المرحلة محلية فقط: مفيش cloud أو paid APIs أو DNS edits. تأكيد الإيميل/الموبايل، password recovery، production trusted proxy، HTTPS deployment، backup/restore وsecurity review قبل نشر عام لسه مؤجلين. Phase 4 متبدأش غير بعد موافقة صاحب المشروع.
