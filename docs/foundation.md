# Phase 2 — Foundation: التنفيذ ونتائج التحقق

اتنفذت يوم 10 أكتوبر 2026 بعد موافقتك. Phase 3 متبدأتش.

## عملنا إيه وليه؟

جهزنا pnpm Monorepo فيه apps/web وapps/api وpackages/config. الفصل ده بيخلّي Next.js مسؤول عن العرض، وNestJS مسؤول عن API وقواعد الشغل، وMongoDB credentials موجودة في Backend بس.

Frontend: Next.js App Router، React، TypeScript strict، Tailwind CSS v4، shadcn/ui Button محلي وcomponents.json، وصفحة Sallty عربية RTL باستخدام Server Component. استخدمنا system fonts عشان التشغيل والـ build ميتوقفوش على تنزيل font خارجي. مفيش signup/dashboard/product features أو بيانات تجار مصطنعة.

Backend: NestJS بـ ESM/NodeNext، MongooseModule للاتصال المحلي، Zod لفحص env، وGET /health وGET /ready. health بتقيس حياة السيرفر، وready بتراجع MongoDB ping وwritable replica-set primary. القيم في الرد محدودة، ومفيش credentials أو connection errors خام بتتعرض.

Next.js Server Component بتفحص API من السيرفر، وrewrite /api/v1/* بيتيح اتصال من نفس origin. الفحوص مستقلة بمهلة زمنية؛ تعطل readiness ميغيّرش حقيقة إن السيرفر شغّال. زر تحديث الحالة بيعمل page reload من غير Client Component أو state إضافية.

## الإصدارات الفعلية

| الأداة                              | الإصدار         |
| ----------------------------------- | --------------- |
| Node.js الموجود                     | 24.21.0         |
| pnpm                                | 12.10.1         |
| Next.js / React                     | 16.4.0 / 19.3.0 |
| NestJS core/common/platform-express | 12.1.2          |
| @nestjs/mongoose / Mongoose         | 12.0.0 / 9.11.1 |
| MongoDB Community Server الموجودة   | 9.0.2           |
| Tailwind CSS / PostCSS plugin       | 4.3.3           |
| TypeScript                          | 6.0.3           |
| ESLint                              | 9.39.5          |

الإصدارات اتراجعت من npm metadata، وبعدها install بـ strict peer dependencies نجح. TypeScript 7 خارج نطاق دعم typescript-eslint الحالي، وESLint 10 خارج نطاق دعم بعض Next.js plugins. ESLint 9 عليه deprecation notice من registry؛ استخدمناه لأنه أحدث 9.x متوافق، وهنراجع upgrade لما plugins تدعم 10. مبطلناش strict peer checks عشان نخفي المشكلة.

## MongoDB محليًا

لقينا MongoDB Community Server وmongosh موجودين بالفعل بعد إعادة فحص الجهاز؛ منزلناش MongoDB binary جديدة. مفيش Docker أو Atlas أو cloud account. القائمة الرسمية للإصدارات اتنزّلت كـ metadata فقط في cache مستبعدة من Git.

db:start بيشغّل نسخة Program Files، أو MONGOD_PATH لو محدد، على 127.0.0.1:27017 وبيخزن بيانات المشروع في .local/mongodb/data. db:init جهّز single-node replica set باسم rs0. ده مناسب للتطوير والـ transactions، مش high availability أو إعداد production.

## اللي اتجرب بالفعل

| الفحص                                    | النتيجة                                                                        |
| ---------------------------------------- | ------------------------------------------------------------------------------ |
| install مع strict peer checks            | نجح بعد اختيار الإصدارات المتوافقة                                             |
| install --frozen-lockfile --offline      | نجح من lockfile/cache المحليين                                                 |
| TypeScript لـ web وapi وTS scripts/tests | نجح                                                                            |
| lint                                     | نجح                                                                            |
| test: env validation/redaction           | نجح                                                                            |
| production Build لـ Next.js وNestJS      | نجح                                                                            |
| db:init                                  | نجح؛ rs0 اتعملت                                                                |
| db:check                                 | transaction commit وrollback حقيقيين نجحوا                                     |
| dev المشترك                              | web وapi بدأوا، وAPI watch أعلن 0 errors                                       |
| /health المباشر و/api/v1/health عبر Next | 200 والـ JSON المتوقع                                                          |
| /ready مع MongoDB                        | 200 وdatabase connected/transactions supported                                 |
| smoke بدون MongoDB                       | health فضلت شغّالة حتى بعد انتهاء مهلة الاتصال، وready رجعت 503                |
| production smoke                         | العربية وRTL في HTML، حالة الاتصال الحقيقية، rewrite، وتعطل API fallback نجحوا |

التجربة كشفت واتصلح: runtime import لـ Mongoose Connection اتغيّر لـ import type، وlazyConnection بتتجاوز onConnectionCreate، فمعالجة الخطأ اتحطت في connectionFactory مع استهلاك initial promise rejection. مفيش catch عالمي يخفي أخطاء التطبيق.

## حدود التحقق

فحص الصفحة بصريًا في أداة المتصفح اتعطل مرتين بسبب helper setup refresh errors. HTML واتصال API اتجربوا فعلًا، لكن mobile visual QA وscreen reader review مش متحققين هنا. افتح الصفحة عندك وجرّب تصغير عرضها وزر تحديث الحالة؛ تصميمها responsive، بس مش هندّعي إن screenshot review اتعمل.

الأوامر داخل sandbox نفسها اتعطلت بخطأ setup refresh؛ فالفحوص المذكورة اتشغلت خارجها بالصلاحيات المطلوبة. دي مشكلة أداة التشغيل، مش نتيجة فشل build للمشروع.

مفيش تجارب Authentication أو tenant isolation business flows لأن الوظائف دي لسه متنفذتش؛ اختباراتهم إلزامية في مراحلهم. index/validator/data-change scripts الخاصة بالـ business schemas مؤجلة لوقت إنشاء schemas؛ Phase 2 مفيهاش production collections للتجار.

لو API بدأت قبل MongoDB وفشل الاتصال الأولي، شغّل MongoDB وبعدين أعد تشغيل API؛ health هتفضل متاحة وready هتوضح عدم الجاهزية. مش هنضيف retry scheduler قبل احتياج فعلي.

## الملفات وطريقة التجربة

README.md فيه خطوات التشغيل من أول install، ووظيفة كل ملف مهم. ملفات .env اتعملت من examples من غير أسرار وبتتجاهلها Git. lockfile اتعملت عشان install تتكرر. Next dev ولّدت apps/web/AGENTS.md بتعليمات نسخة Next المثبتة؛ ده ملف tooling مش feature جديدة.

الاختيار الحالي تطوير محلي مجاني؛ مفيش خدمة مدفوعة أو card أو DNS اتغيروا. Sallty مش production-ready بمجرد نجاح Build؛ النشر والأمان التشغيلي والـ backups ليهم مرحلة منفصلة.

الخطوة التالية Phase 3: الحسابات وإنشاء المتجر، بعد موافقتك الصريحة بس.
