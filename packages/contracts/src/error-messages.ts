import { messages, translateText } from './messages.js';
const errorMessages: Record<string, [string, string]> = {
  CHECKOUT_UNAVAILABLE: [
    'إتمام الطلب غير متاح. تحقق من توفر المنتجات وإعدادات الشحن.',
    'Checkout unavailable. Check product availability and shipping settings.',
  ],
  QUOTE_CHANGED: [
    'تغير السعر أو الشحن. راجع الإجمالي الجديد قبل تأكيد الطلب.',
    'Prices or shipping changed. Review the updated total before placing your order.',
  ],
  OUT_OF_STOCK: [
    'الكمية المطلوبة غير متاحة. عدّل السلة.',
    'The requested quantity is unavailable. Update your cart.',
  ],
  IDEMPOTENCY_CONFLICT: [
    'سبق تأكيد هذه المحاولة ببيانات مختلفة. راجع الطلب السابق قبل طلب جديد.',
    'This request was already placed with different details. Check your existing order before ordering again.',
  ],
  ORDER_TRANSITION_INVALID: [
    'حالة الطلب تغيرت أو الانتقال غير مسموح. حدّث الصفحة.',
    'The status changed or this transition is not allowed. Refresh the page.',
  ],
  ORDER_NOT_FOUND: ['الطلب أو المتجر غير موجود.', 'Order or store not found.'],
  RESTORE_FAILED: [
    'تعذر إلغاء الطلب بأمان. راجع المنتج وحد المخزون.',
    'Unable to cancel safely. Check the product and stock limit.',
  ],
  IDEMPOTENCY_REQUIRED: [
    'مفتاح تأكيد الطلب غير صالح.',
    'Invalid order request key.',
  ],
  RESET_INVALID: [
    'رابط استعادة كلمة المرور غير صالح أو منتهي الصلاحية',
    'This password reset link is invalid or expired.',
  ],
  INVALID_CREDENTIALS: [
    'البريد الإلكتروني أو كلمة المرور غير صحيحة',
    'Incorrect email or password.',
  ],
  EMAIL_EXISTS: [
    'البريد الإلكتروني مسجل بالفعل. سجّل الدخول.',
    'This email is already registered. Sign in instead.',
  ],
  EMAIL_NOT_VERIFIED: [
    'يرجى تأكيد البريد الإلكتروني أولًا',
    'Verify your email first.',
  ],
  OTP_INVALID: [
    'رمز التأكيد غير صحيح أو منتهي الصلاحية',
    'The verification code is invalid or expired.',
  ],
  RESEND_COOLDOWN: [
    'انتظر دقيقة قبل طلب رمز جديد',
    'Wait one minute before requesting another code.',
  ],
  MAIL_DELIVERY_FAILED: [
    'تعذر إرسال البريد الإلكتروني. حاول مرة أخرى لاحقًا.',
    'Email delivery failed. Please try again later.',
  ],
  MAIL_NOT_CONFIGURED: [
    'خدمة البريد الإلكتروني غير مهيّأة. يرجى التواصل مع الدعم.',
    'Email is not configured. Contact support.',
  ],
  UNAUTHENTICATED: ['يرجى تسجيل الدخول', 'Please sign in.'],
  ADMIN_REQUIRED: [
    'هذه الصفحة مخصصة لمسؤول المنصة',
    'Administrator access is required.',
  ],
  RATE_LIMITED: [
    'تم تجاوز عدد المحاولات المسموح. حاول لاحقًا.',
    'Too many attempts. Please try again later.',
  ],
};
export function localizedError(
  code: string,
  text: string,
  locale: 'ar' | 'en',
) {
  const known = errorMessages[code];
  if (known) return known[locale === 'ar' ? 0 : 1];
  if (messages[text.replace(/\s+/g, ' ').trim()])
    return translateText(text, locale);
  if (text.includes('التصنيف مستخدم'))
    return locale === 'ar'
      ? 'التصنيف مستخدم في منتجات. انقل المنتجات المرتبطة، بما فيها المؤرشفة، قبل حذفه.'
      : 'This category is used by products. Move all assigned products, including archived ones, before deleting it.';
  if (text.includes('الصورة مستخدمة'))
    return locale === 'ar'
      ? 'الصورة مستخدمة في منتج ولا يمكن حذفها قبل فصلها وحفظ المنتج.'
      : 'This image is assigned to a product. Detach it and save the product before deleting it.';
  return locale === 'en'
    ? 'The request could not be completed. Check your input and try again.'
    : 'تعذر إكمال الطلب. يرجى التحقق من البيانات والمحاولة مرة أخرى.';
}
