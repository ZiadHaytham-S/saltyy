# Phase 4: المنتجات والتصنيفات — قرارات التنفيذ

الموافقة وصلت يوم 11 أكتوبر 2026. النطاق الحالي Products/Categories وإدارة الصور المحلية فقط؛ مفيش publish/storefront/checkout/orders/payments أو cloud.

- الأسعار أعداد صحيحة بالقروش: 125.50 جنيه = 12550. الإدخال من نص عشري، من غير ضرب floating point. حد السعر مليون جنيه، والمخزون مليون قطعة.
- اسم عربي، وصف plain text، slug إنجليزي فريد داخل المتجر، SKU اختياري فريد داخل المتجر. Draft/Active/Archived حالات إدارة؛ Active مش نشر عام في المرحلة دي.
- DELETE المنتج أرشفة تحفظ الـ slug والبيانات، ويمكن استرجاعه بتعديل الحالة. حذف تصنيف مستخدم مرفوض 409 حتى لو المنتج Archived؛ لازم تفصل المنتجات أو تنقلها أولًا.
- كل query وassociation ورفع/قراءة/حذف صورة بياخد storeId من StoreGuard المشتق من session owner، مش المتصفح. Foreign IDs ترجع 404؛ category/image IDs الأجنبية مرفوضة.
- transaction لكل تعديل catalog يحتاج associations/stock audit، مع تحديث catalogRevision في Store لتسلسل التعديلات داخل نفس المتجر. ده يمنع سباق حذف category/image مع ربطها بمنتج. كل operation تستخدم نفس session، من غير parallel operations أو filesystem side effects جوه callback. update/delete لها version لمنع ضياع تعديل متزامن.
- الصور JPEG/PNG/WebP فقط، 5 MiB للملف، 16 مليون pixel، و8 صور للمنتج. نتحقق من signature وdecode بـ sharp، ونرفض SVG/GIF/ملف متنكر أو تالف/animated، ونحوّل WebP ثابت من غير metadata. أسماء عشوائية، private local storage خارج public، والقراءة عبر endpoint محمي.
- Storage Adapter واجهة بسيطة put/read/remove؛ implementation محلي فقط في .local/uploads. تغيير storage لاحقًا يغيّر adapter، مش منطق المنتجات. مفيش وعد بصلاحية التخزين المحلي للنشر العام.
- حدود التخزين: 50 صورة و100 MiB لكل متجر، 1000 منتج و200 تصنيف. حذف صورة مرتبطة بمنتج مرفوض؛ فصلها من المنتج قبل حذفها. الصور المرفوعة غير المرتبطة تظهر في الفورم ويمكن حذفها؛ مفيش حذف filesystem جوه transaction.
- Search نص حرفي محدود، query allowlist صارمة، status/category filters وpagination 20 صف (حد 50)، ترتيب ثابت newest+id. لا raw Mongo filters أو operators.

## إزاي تستخدم الإدارة؟

1. شغّل MongoDB replica set، وبعدها `pnpm dev` من جذر المشروع. افتح `http://127.0.0.1:3000/login` بحساب إيميله مؤكد وعنده متجر. أدوات Node.js وpnpm وMongoDB وEdge موجودة على الجهاز، ومفيش برنامج خارجي جديد مطلوب للمرحلة.
2. من Dashboard افتح «التصنيفات». اكتب اسم عربي وSlug زي `clothes`. تعديل وحذف كل تصنيف موجودين جنبه، وفيه تأكيد قبل الحذف.
3. افتح «المنتجات» ← «إضافة منتج». الاسم والـ Slug والسعر والمخزون أساسيين؛ الوصف وSKU وسعر قبل الخصم والتصنيف والصور حسب الاحتياج. مثال السعر `١٢٥٫٥٠` بيتحول لـ12550 قرش. سعر قبل الخصم لازم يكون أعلى من السعر الحالي.
4. «رفع صورة جديدة» يضيفها لمكتبة المتجر. الصور المختارة بس بتترتبط بالمنتج عند الحفظ؛ أول اختيار هو الصورة الرئيسية. الصورة ممكن تفضل غير مرتبطة لو سيبت الفورم، وتقدر تحذفها من المكتبة بعد التأكيد. إزالة علامة الاختيار تحتاج حفظ المنتج قبل الحذف النهائي من المكتبة.
5. «تعديل» يفتح نفس الفورم، و«أرشفة المنتج» يحفظ بياناته بحالة Archived. اختار «نشط» واحفظ لاسترجاعه. Active حالة داخل الإدارة حاليًا، مش متجر عام منشور.
6. البحث باسم المنتج، وحالة المنتج والتصنيف، والتنقل بين الصفحات موجودين في القائمة. الطلبات بترجع فقط بيانات صاحب الجلسة، حتى لو عدّل IDs أو query يدويًا.

## وظيفة الملفات المهمة

| الملف                                                | مسؤوليته                                                                                                                                                                                                 |
| ---------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `packages/contracts/src/catalog.ts`                  | Zod schemas مشتركة، types، وتحويل جنيه/قرش من غير floating point. Strict object يعني أي field زيادة زي storeId أو $set مرفوض.                                                                            |
| `apps/api/src/modules/catalog/catalog.schemas.ts`    | Mongoose shapes والحدود وunique indexes للمنتج والتصنيف، والصور وسجل المخزون.                                                                                                                            |
| `apps/api/src/modules/catalog/catalog.guard.ts`      | StoreGuard بيجيب المتجر من صاحب Session؛ الـ browser مش بيختار المتجر المصرح له.                                                                                                                         |
| `apps/api/src/modules/catalog/catalog.controller.ts` | REST endpoints وGuards وValidation ورفع multipart بحدود.                                                                                                                                                 |
| `apps/api/src/modules/catalog/catalog.service.ts`    | قواعد الربط والعزل والأسعار والحذف والتعارض والـ transactions؛ كل DB read/write scoped. الصور في صفحة المنتجات بتتجاب بquery واحدة للصفحة بدل query لكل منتج.                                            |
| `apps/api/src/modules/catalog/storage.ts`            | StorageAdapter وLocalStorageAdapter، وفحص محتوى الصورة وإعادة ترميزها؛ الملفات خارج public. حد عمليتين decode في نفس الوقت لكل API process لحماية الذاكرة، ومحاولة زيادة ترجع 503 قابلة لإعادة المحاولة. |
| `apps/web/src/lib/api/catalog.ts`                    | Server-side reads من NestJS مع session cookie وno-store، وتحويل unauthorized/not found/errors لحالات واضحة.                                                                                              |
| `apps/web/src/lib/api/catalog-actions.ts`            | Server Action محمية بتبطل cache صفحات الإدارة بعد التغييرات. مش بتحفظ منتجات أو بتوصل لـ MongoDB؛ NestJS لسه مسؤول عن كل mutations والصلاحيات.                                                           |
| `apps/web/src/app/dashboard/products`                | Server Components للقائمة والإنشاء والتعديل؛ Search/Filters/Pagination وLoading وNot Found.                                                                                                              |
| `apps/web/src/app/dashboard/categories`              | صفحة التصنيفات وLoading.                                                                                                                                                                                 |
| `apps/web/src/components/product-form.tsx`           | تفاعل الفورم، تحويل الأسعار، اختيار الصور ورفعها، حالات الانتظار ورسائل الأخطاء. اختيار التصنيف والحالة controlled لتثبيت الاختيارات مع باقي تفاعل الفورم.                                               |
| `apps/web/src/components/category-manager.tsx`       | إضافة وتعديل التصنيفات وتأكيد الحذف وعرض رفض حذف تصنيف مستخدم.                                                                                                                                           |
| `apps/web/src/components/catalog-actions.tsx`        | تأكيد الأرشفة؛ شرح أثرها واسترجاع المنتج.                                                                                                                                                                |
| `apps/web/src/components/merchant-nav.tsx`           | التنقل بين نظرة عامة والمنتجات والتصنيفات بالعربي وRTL.                                                                                                                                                  |
| `apps/api/test/catalog.test.ts`                      | Unit tests للأسعار والبيانات والصور والتخزين وحد معالجة الصور المتزامنة.                                                                                                                                 |
| `apps/api/test/catalog.integration.test.mjs`         | API/DB/filesystem tests حقيقية ومعزولة؛ تاجر A وتاجر B واختبارات التزامن والـ rollback.                                                                                                                  |
| `scripts/auth-web-test.mjs`                          | رحلة فعلية في Edge لـ Auth وCatalog، باستخدام SMTP محلي وقاعدة وملفات مؤقتة.                                                                                                                             |

Storage Adapter معناه عقد ثابت للتخزين. مثال: CatalogService ينادي `storage.put(key, image)`؛ حاليًا الملف يتكتب على الجهاز، ولو اتوافقنا على تخزين خارجي لاحقًا هنغيّر implementation والتوصيل في Module، من غير إعادة كتابة إدارة المنتجات. مفيش Cloud adapter اتعمل دلوقتي.

Version رقم تعديل المنتج. لو جهازين فتحوا version=1، الأول يحفظ ويبقى version=2؛ الطلب التاني اللي لسه version=1 يترفض 409، فيحمّل البيانات الجديدة بدل ما يمسح تعديل الأول. Transaction معناها تعديل المنتج وسجل تغيير المخزون ينجحوا مع بعض أو يتلغوا مع بعض. catalogRevision في المتجر بيسلسِل الكتابة جوا نفس المتجر، علشان حذف التصنيف وطلب ربطه بمنتج ميحصلوش بشكل يسيب reference مكسورة.

الفورم بيستنى React يربط أحداثه قبل ما يسمح بالتعديل؛ ده اسمه Hydration. مثلًا لو صفحة منتج ظهرت ولسه JavaScript بيتجهز، مينفعش اختيار التصنيف يضيع وقت تفعيل الفورم. `apps/web/src/lib/use-hydrated.ts` بيضبط الجاهزية دي، والاختبار بيتأكد من رد الـ API بعد تغيير التصنيف والحالة والصور مع بعض. Cache invalidation بعد mutations يمنع الرجوع لنسخة قديمة من صفحة التعديل.

## API الحالية

- `GET /merchant/products`: q/status/categoryId/page/pageSize فقط؛ default pageSize=20 وحد 50.
- `POST /merchant/products` و`GET/PATCH/DELETE /merchant/products/:id`. PATCH يبعت الحقول كاملة وversion؛ DELETE يبعت version ويأرشف.
- `GET/POST /merchant/categories` و`PATCH/DELETE /merchant/categories/:id`. PATCH/DELETE يحتاجوا version.
- `GET/POST /merchant/media` و`GET/DELETE /merchant/media/:id`. POST ملف واحد اسمه file، من غير fields زيادة، و30 محاولة رفع لكل ساعة لكل متجر. DELETE body فارغة `{}`.

المتصفح يضيف `/api/v1` للـ paths، وطلبات الكتابة تحتاج exact Origin وCSRF header وSession. `multipart/form-data` مسموح لمسار الرفع فقط؛ باقي الكتابة JSON. الـ Guards بتشتغل قبل استقبال الملف، والـ error responses مفيهاش تفاصيل database أو disk paths. قراءة الصور نفسها محتاجة صاحب المتجر وإيميل مؤكد، وresponse image/webp وnosniff/no-store.

## الاختبارات والنتائج — 11 أكتوبر 2026

أوامر من PowerShell في `D:\sallty`:

```powershell
.\pnpm.cmd typecheck
.\pnpm.cmd lint
.\pnpm.cmd test
.\pnpm.cmd test:integration
.\pnpm.cmd test:web
.\pnpm.cmd build
.\pnpm.cmd format:check
```

- Unit: 8 اختبارات للأسعار الدقيقة والأرقام العربية، allowlists، الصور المتنكرة/التالفة/المتحركة/الضخمة، strip EXIF وإعادة WebP، path traversal، حد decode المتزامن، وإعدادات الأمن.
- Integration/Security: 29 اختبارًا حسب عدّاد Node، بما فيهم parent suites. 14 سيناريو Auth و13 Catalog على MongoDB replica set حقيقية، من غير استخدام Gmail الحقيقي. DB باسم عشوائي مخصص للاختبار، وملفات في folder مؤقت تحت `.local`؛ التنضيف بيتحقق من الاسم والمسار قبل الحذف.
- اختبارات العزل جربت GET/PATCH/DELETE بمنتج أجنبي، تعديل/حذف تصنيف أجنبي، قراءة/حذف صورة أجنبية، وربط category/image أجنبية بمنتج، وforged storeId/operators. القوائم والبحث وcount وfilters معزولين.
- اختبارات التزامن: slug متكرر؛ تحديثين بنفس version؛ حذف category/image مع ربطهم بمنتج. مفيش references مكسورة. فرضنا فشل كتابة StockMovement جوه قاعدة الاختبار، فتأكدنا إن السعر/المخزون وversion وcatalogRevision وسجل المخزون مفيهمش كتابة جزئية.
- Quotas وrate limiting وDELETING retry اتجربوا من Backend. حالة DELETING مبتتقرأش ومينفعش تتربط بمنتج لحد إتمام الحذف.
- المتصفح: Register/OTP/Store/Login/Logout القديمة، Category create/edit/delete، رفض حذف مستخدم، Product create/edit/archive/restore، رفع صورة وعرضها، فصل وحذف الصورة، بحث بدون نتائج، وRTL على 390px و1280px. صور الشاشة في `.local/test-artifacts`؛ مفيش horizontal overflow أو JavaScript errors في الرحلة.

نجح Build وTypeScript وLint. `test:smoke` الخاص بـ Foundation متعادش في المرحلة دي لأن dev شغال على ports 3000/4000؛ رحلة production للمرحلة الحالية اتجربت بـ `test:web` على ports معزولة. فحص `/health` و`/ready` وصفحة `/login` على السيرفر المحلي رجع 200.

## حدود المرحلة وتجربة يدوية مفيدة

- جرّب صور منتجاتك الحقيقية وأسماء طويلة والتنقل بين فلاتر فيها نتائج كتير. الاختبار الآلي استخدم صور مولّدة محليًا وfixtures مؤقتة؛ مش بيانات منتجاتك أو Gmail الحقيقي.
- الصورة الكبيرة بتتصغّر لحد 2048×2048 مع الحفاظ على الأبعاد؛ GIF/SVG والـ animation مرفوضين. حدود pixel/ملف ووقت decode وrate limit مقصودة للتطوير المحلي. Implementation الرفع مبني على [NestJS file upload](https://docs.nestjs.com/techniques/file-upload) وفحص المحتوى على [sharp constructor](https://sharp.pixelplumbing.com/api-constructor/).
- التخزين المحلي للتطوير فقط ومحتاج backup مع قاعدة البيانات. لو process اتقفلت فجأة بين كتابة ملف وحفظ media record، ممكن ملف يتيم يفضل على القرص؛ reconciliation/backup ونشر storage دائم لمرحلة تجهيز النشر، مش حذف آلي لملفاتك دلوقتي. فشل حذف disk بعد تعليم DELETING يمكن إعادة محاولته من المكتبة؛ انقطاع كهرباء/قرص ممتلئ على جهازك محتاج تجربة يدوية منفصلة.
- سجل المخزون داخلي، مفيش Orders أو مخزون محجوز أو خصم مخزون لطلب في المرحلة دي. Public image access وstore publishing يتصمموا في Phase 5 بعد الموافقة.
- مفيش paid service أو Cloud أو DNS change. Dependencies الجديدة الضرورية `sharp` و`multer` و`@types/multer` بإصدارات exact بعد فحص engines؛ sharp كانت موجودة transitive مع Next.

الخطوة التالية المقترحة Phase 5: Storefront وCart وGuest Checkout وOrders بـ COD، بخطة واختبارات مخزون/idempotency منفصلة بعد موافقتك. التنفيذ بيقف هنا.
