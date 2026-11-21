# تعديل Phase 3: تأكيد الإيميل والتصميم — 11 أكتوبر 2026

صاحب المشروع وافق على إضافة OTP باستخدام Nodemailer وGmail، وتغيير التصميم للأزرق مع خط جديد وزر Logout واضح. ده تعديل Phase 3، مش بدء Products أو Orders.

## التسجيل والحسابات الموجودة

التسجيل ينشئ User+Session، وبعد commit يرسل كود ثم يحوّل لـ `/verify-email`. بعد التأكيد ينتقل لإنشاء المتجر أو يرجع لمتجره الموجود. الحسابات والمتاجر القديمة محفوظة؛ الحساب غير المؤكد يطلب كود جديد، مش يعمل حساب تاني. Logout ظاهر في header على verify/onboarding/dashboard، ومش محتاج إيميل مؤكد.

OTP هي One-Time Password: كود مؤقت لتأكيد إن التاجر عنده وصول للإيميل. 6 أرقام من crypto.randomInt، صالحة 10 دقايق. MongoDB تخزن HMAC مربوط بـ userId وnonce، مش الكود نفسه. HMAC هي بصمة بمفتاح سري؛ تجربة كل الأكواد من نسخة database لوحدها مش كفاية لمعرفة الكود.

5 محاولات للكود، و10 verification requests كل 15 دقيقة للحساب، و5 إرسال requests في الساعة مع 60 ثانية cooldown. Conditional updates بتمنع تجاوز المحاولات المتزامنة وإعادة الاستخدام. nonce جديد يبطل challenge القديم. OTP fields مخفية من queries الافتراضية والـ DTOs.

الإرسال خارج transaction callback؛ لو SMTP فشلت، الحساب والجلسة يفضلوا موجودين، والكود اللي ما اتبعتش بيتبطل. الواجهة توضح فشل الإرسال وتسمح بإعادة المحاولة. `/auth/email/resend` و`/auth/email/verify` محميين بـ session/Origin/CSRF. Store endpoints لازم session + emailVerified من database؛ flag في المتصفح مش إذن.

## إعداد Gmail

Nodemailer بيستخدم smtp.gmail.com:465 وTLS. APPLICATION_EMAIL وAPPLICATION_PASSWORD في `apps/api/.env` فقط. استخدم App Password جديدة مع 2-Step Verification؛ CLIENT_ID مش مستخدمة لأن OAuth خارج النطاق. [توثيق Nodemailer](https://nodemailer.com/usage/using-gmail/) و[Google App Passwords](https://support.google.com/accounts/answer/185833).

Gmail الشخصي له حدود: Google بتذكر إن تجاوز 500 رسالة في اليوم أو 500 recipient في رسالة واحدة ممكن يوقف الإرسال مؤقتًا 1–24 ساعة. مناسب لتجربة صغيرة؛ مش ضمان delivery أو خدمة إرسال تجارية دائمة. [الحدود الرسمية](https://support.google.com/mail/answer/22839). مفيش paid service أو provisioning أو DNS edits.

```powershell
.\pnpm.cmd --filter @sallty/api mail:check
.\pnpm.cmd --filter @sallty/api mail:check --send-test
```

الأول يفحص SMTP login من غير رسالة. التاني يرسل رسالة تقنية لنفس عنوان الإرسال فقط. الأسرار مش بتتطبع. الاختبار الحقيقي نجح: Gmail authenticated وقبل رسالة الاختبار؛ الوصول لـ Inbox/Spam محتاج مراجعة صاحب الحساب.

بعد تغيير `.env` أعد تشغيل API. الحساب القديم يدخل `/verify-email` ويضغط «إرسال كود جديد» ثم يدخل الكود؛ متجره محفوظ.

## الاختبارات والتصميم

اختبارات Backend تستخدم SMTP محلي حقيقي مع Nodemailer وMongoDB replica set؛ ممنوع SMTP test تخرج لـ Gmail. بتختبر التسليم، الغلط، expiry، replay، concurrent attempts، cooldown، عزل الحسابات، وحفظ الحساب لو الإرسال فشل. Playwright يقرأ كود حساب الاختبار من SMTP المحلي ويجرّب verify ثم onboarding/dashboard/logout فعلًا.

الأزرق والكحلي والخلفية الفاتحة، وخط Cairo Variable محلي من @fontsource-variable/cairo. مفيش Google Fonts requests في المتصفح أو build. Dashboard توضّح حالة الحساب والمتجر والخطوة التالية، من غير analytics مصطنعة. صفحة Dashboard الحالية نهاية onboarding، مش تعليق في التسجيل؛ Products/Nشر لسه مراحل تالية.

تأكيد الموبايل وpassword recovery لسه مؤجلين قبل نشر عام. التطبيق وMongoDB محليين؛ Gmail خدمة خارجية اتطلبت صراحة. Phase 4 محتاجة موافقة مستقلة.

## التحقق النهائي

Build وTypeScript وLint وformat:check نجحوا، واختبارين للإعدادات و15 اختبار Backend بما فيهم الـ parent test. رحلة Edge الفعلية نجحت بعد إضافة verify-email، والصور على mobile/desktop اتراجعت بصريًا؛ مفيش horizontal overflow أو JavaScript errors. Gmail الحقيقي قبل رسالة الاختبار، ولسه الوصول للـ Inbox/Spam يحتاج مراجعة يدويًا. بعد ما MongoDB كانت مقفولة أثناء الفحص، اتشغّلت rs0 المحلية وأعيدت الاختبارات بنجاح، ثم اتشغّلت dev على 3000/4000.
