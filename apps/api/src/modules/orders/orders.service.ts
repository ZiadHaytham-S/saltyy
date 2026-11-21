import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import { InjectConnection, InjectModel } from '@nestjs/mongoose';
import {
  Types,
  type Model,
  type Connection,
  type ClientSession,
} from 'mongoose';
import { createHash, createHmac, randomBytes } from 'node:crypto';
import {
  ORDER_TRANSITIONS,
  checkedTotal,
  type CartItem,
  type CheckoutInput,
  type CartQuote,
  type OrderQuery,
  type OrderUpdate,
  type MerchantOrder,
  type OrderSummary,
} from '@sallty/contracts';
import { STORE, type Store } from '../../database/schemas.js';
import { PRODUCT, type ProductRecord } from '../catalog/catalog.schemas.js';
import {
  ORDER,
  ORDER_MOVEMENT,
  type OrderRecord,
  type OrderMovementRecord,
} from './orders.schemas.js';
import { environment } from '../../config/env.js';
import { isDuplicateKey } from '../../common/validation.js';
const hash = (value: string) =>
  createHash('sha256').update(value).digest('hex');
const missing = () =>
  new NotFoundException({
    code: 'ORDER_NOT_FOUND',
    message: 'الطلب غير موجود.',
  });
const conflict = (code: string, message: string) =>
  new ConflictException({ code, message });
const objectId = (value: string) => {
  if (!/^[a-f\d]{24}$/i.test(value)) throw missing();
  return new Types.ObjectId(value);
};
function summary(order: OrderRecord): OrderSummary {
  return {
    id: String(order._id),
    orderNumber: order.orderNumber,
    status: order.status,
    version: order.version,
    totalPiastres: order.totalPiastres,
    currency: order.currency,
    createdAt: order.createdAt.toISOString(),
  };
}
@Injectable()
export class OrdersService {
  constructor(
    @InjectConnection() private readonly connection: Connection,
    @InjectModel(STORE) private readonly stores: Model<Store>,
    @InjectModel(PRODUCT) private readonly products: Model<ProductRecord>,
    @InjectModel(ORDER) private readonly orders: Model<OrderRecord>,
    @InjectModel(ORDER_MOVEMENT)
    private readonly movements: Model<OrderMovementRecord>,
  ) {}
  private transact<T>(operation: (session: ClientSession) => Promise<T>) {
    return this.connection.transaction(operation, {
      readConcern: { level: 'snapshot' },
      writeConcern: { w: 'majority' },
      maxCommitTimeMS: 5000,
    });
  }
  private sign(domain: string, value: unknown) {
    return createHmac('sha256', Buffer.from(environment.CSRF_SECRET, 'hex'))
      .update(JSON.stringify([domain, value]))
      .digest('base64url');
  }
  private async publicStore(slug: string, session?: ClientSession) {
    const store = await this.stores
      .findOne({ slug })
      .session(session ?? null)
      .lean();
    if (!store) throw missing();
    return store;
  }
  private async owned(ownerId: string, session?: ClientSession) {
    const store = await this.stores
      .findOne({ ownerId: objectId(ownerId) })
      .session(session ?? null)
      .lean();
    if (!store) throw missing();
    return store;
  }
  private async fence(store: Store, session: ClientSession) {
    if (
      !(await this.stores.findOneAndUpdate(
        { _id: store._id },
        { $inc: { catalogRevision: 1 } },
        { session },
      ))
    )
      throw missing();
  }
  async shipping(ownerId: string) {
    const store = await this.owned(ownerId);
    return {
      shippingFeePiastres: store.shippingFeePiastres ?? null,
      checkoutSupported:
        (store.country ?? 'EG') === 'EG' && (store.currency ?? 'EGP') === 'EGP',
    };
  }
  async updateShipping(ownerId: string, fee: number) {
    await this.transact(async (session) => {
      const store = await this.owned(ownerId, session);
      await this.stores.updateOne(
        { _id: store._id, ownerId: objectId(ownerId) },
        { $set: { shippingFeePiastres: fee }, $inc: { catalogRevision: 1 } },
        { session, runValidators: true },
      );
    });
    return this.shipping(ownerId);
  }
  private async buildQuote(
    store: Store,
    items: CartItem[],
    session?: ClientSession,
  ): Promise<CartQuote> {
    const sorted = [...items].sort((a, b) => a.slug.localeCompare(b.slug));
    const products = await this.products
      .find({
        storeId: store._id,
        slug: { $in: sorted.map((i) => i.slug) },
        status: 'ACTIVE',
      })
      .session(session ?? null)
      .lean();
    const quoted = sorted.map((item) => {
      const p = products.find((p) => p.slug === item.slug);
      return {
        ...item,
        name: p?.name ?? item.slug,
        unitPricePiastres: p?.pricePiastres ?? null,
        lineTotalPiastres: p
          ? checkedTotal([p.pricePiastres * item.quantity])
          : 0,
        available: !!p && p.stockQuantity >= item.quantity,
      };
    });
    const subtotalPiastres = checkedTotal(
        quoted.map((i) => i.lineTotalPiastres),
      ),
      requiresShipping = products.some(
        (p) => (p.type ?? 'PHYSICAL') === 'PHYSICAL',
      ),
      containsDigital = products.some((p) => p.type === 'DIGITAL'),
      paymentMethod = containsDigital ? ('MANUAL' as const) : ('COD' as const),
      shippingFeePiastres = requiresShipping
        ? (store.shippingFeePiastres ?? null)
        : 0;
    const checkoutEnabled =
      (store.country ?? 'EG') === 'EG' &&
      (store.currency ?? 'EGP') === 'EGP' &&
      shippingFeePiastres !== null &&
      quoted.every((i) => i.available);
    const totalPiastres = checkoutEnabled
      ? checkedTotal([subtotalPiastres, shippingFeePiastres ?? 0])
      : null;
    const quoteToken = checkoutEnabled
      ? this.sign('checkout-quote', [
          String(store._id),
          quoted.map((i) => [
            i.slug,
            i.name,
            i.quantity,
            i.unitPricePiastres,
            products.find((p) => p.slug === i.slug)?.type ?? 'PHYSICAL',
            products.find((p) => p.slug === i.slug)?.version,
          ]),
          shippingFeePiastres,
          'EGP',
        ])
      : null;
    return {
      items: quoted,
      requiresShipping,
      containsDigital,
      paymentMethod,
      subtotalPiastres,
      shippingFeePiastres,
      totalPiastres,
      checkoutEnabled,
      currency: store.currency ?? 'EGP',
      quoteToken,
    };
  }
  async quote(slug: string, items: CartItem[]) {
    return this.buildQuote(await this.publicStore(slug), items);
  }
  private receiptToken(storeId: Types.ObjectId, key: string) {
    // The random request capability is secret; recovery survives app-secret rotation.
    return createHash('sha256')
      .update(JSON.stringify(['sallty-receipt-v1', String(storeId), key]))
      .digest('base64url');
  }
  private response(order: OrderRecord, key: string) {
    return {
      orderNumber: order.orderNumber,
      receiptToken: this.receiptToken(order.storeId, key),
    };
  }
  private replay(order: OrderRecord, requestHash: string, key: string) {
    if (order.requestHash !== requestHash)
      throw conflict(
        'IDEMPOTENCY_CONFLICT',
        'هذا الطلب سبق استخدامه ببيانات مختلفة. راجع تأكيد طلبك قبل إنشاء طلب جديد.',
      );
    return this.response(order, key);
  }
  async checkout(slug: string, input: CheckoutInput, key: string) {
    const items = [...input.items].sort((a, b) => a.slug.localeCompare(b.slug));
    // Quote token is consent to current totals, not client-controlled prices. Retries match business input.
    const requestHash = hash(
        JSON.stringify({
          items,
          customer: input.customer,
          paymentMethod: input.paymentMethod,
        }),
      ),
      idempotencyHash = hash(key),
      orderId = new Types.ObjectId(),
      orderNumber = 'SL-' + randomBytes(8).toString('hex').toUpperCase();
    try {
      return await this.transact(async (session) => {
        const store = await this.publicStore(slug, session);
        const existing = await this.orders
          .findOne({ storeId: store._id, idempotencyHash })
          .select('+requestHash')
          .session(session)
          .lean();
        if (existing) return this.replay(existing, requestHash, key);
        await this.fence(store, session);
        const quote = await this.buildQuote(store, items, session);
        if (
          !quote.checkoutEnabled ||
          quote.shippingFeePiastres === null ||
          quote.totalPiastres === null
        )
          throw conflict(
            'CHECKOUT_UNAVAILABLE',
            'تعذر إتمام الطلب. تحقق من توفر المنتجات وإعدادات الشحن.',
          );
        if (input.quoteToken !== quote.quoteToken)
          throw conflict(
            'QUOTE_CHANGED',
            'تغير السعر أو الشحن. راجع الإجمالي الجديد قبل تأكيد الطلب.',
          );
        if (input.paymentMethod !== quote.paymentMethod)
          throw new BadRequestException({
            code: 'PAYMENT_METHOD_INVALID',
            message: 'راجع طريقة الدفع المطلوبة لهذا الطلب.',
          });
        if (
          quote.requiresShipping &&
          (!input.customer.governorate ||
            !input.customer.city ||
            !input.customer.address)
        )
          throw new BadRequestException({
            code: 'ADDRESS_REQUIRED',
            message: 'العنوان مطلوب للمنتجات الملموسة.',
          });
        const customer = quote.requiresShipping
          ? input.customer
          : {
              name: input.customer.name,
              phone: input.customer.phone,
              notes: input.customer.notes,
            };
        const snapshots: OrderRecord['items'] = [];
        for (const item of quote.items) {
          const product = await this.products
            .findOneAndUpdate(
              {
                storeId: store._id,
                slug: item.slug,
                status: 'ACTIVE',
                stockQuantity: { $gte: item.quantity },
              },
              { $inc: { stockQuantity: -item.quantity, version: 1 } },
              { session, returnDocument: 'after', runValidators: true },
            )
            .lean();
          if (!product)
            throw conflict(
              'OUT_OF_STOCK',
              'كمية المنتج غير متاحة. حدّث السلة.',
            );
          snapshots.push({
            type: product.type ?? 'PHYSICAL',
            digitalDelivery:
              product.type === 'DIGITAL'
                ? (product.digitalDelivery ?? null)
                : null,
            productId: product._id,
            slug: product.slug,
            name: product.name,
            quantity: item.quantity,
            unitPricePiastres: product.pricePiastres,
            lineTotalPiastres: checkedTotal([
              product.pricePiastres * item.quantity,
            ]),
          });
          await this.movements.create(
            [
              {
                storeId: store._id,
                orderId,
                productId: product._id,
                kind: 'RESERVE',
                delta: -item.quantity,
                quantityAfter: product.stockQuantity,
              },
            ],
            { session },
          );
        }
        const receiptToken = this.receiptToken(store._id, key);
        const [order] = await this.orders.create(
          [
            {
              _id: orderId,
              storeId: store._id,
              orderNumber,
              status: 'PENDING' as const,
              version: 0,
              currency: 'EGP' as const,
              paymentMethod: quote.paymentMethod,
              requiresShipping: quote.requiresShipping,
              paymentStatus: 'UNPAID',
              customer,
              items: snapshots,
              subtotalPiastres: quote.subtotalPiastres,
              shippingFeePiastres: quote.shippingFeePiastres,
              totalPiastres: quote.totalPiastres,
              idempotencyHash,
              requestHash,
              receiptHash: hash(receiptToken),
              receiptExpiresAt: new Date(Date.now() + 7 * 86400000),
              stockRestored: false,
              events: [{ from: null, to: 'PENDING', at: new Date() }],
            },
          ],
          { session },
        );
        if (!order) throw new Error('Order write failed');
        return this.response(order.toObject(), key);
      });
    } catch (error) {
      if (isDuplicateKey(error)) {
        const store = await this.publicStore(slug);
        const existing = await this.orders
          .findOne({ storeId: store._id, idempotencyHash })
          .select('+requestHash')
          .lean();
        if (existing) return this.replay(existing, requestHash, key);
      }
      throw error;
    }
  }
  async recover(slug: string, key: string) {
    const store = await this.publicStore(slug);
    const order = await this.orders
      .findOne({ storeId: store._id, idempotencyHash: hash(key) })
      .lean();
    if (!order) throw missing();
    return this.response(order, key);
  }
  async confirmPayment(ownerId: string, value: string, version: number) {
    await this.transact(async (session) => {
      const store = await this.owned(ownerId, session);
      const order = await this.orders
        .findOne({ _id: objectId(value), storeId: store._id })
        .session(session)
        .lean();
      if (!order) throw missing();
      if (order.paymentStatus === 'PAID') return;
      if (
        order.status === 'CANCELLED' ||
        order.version !== version ||
        !order.items.some((i) => i.type === 'DIGITAL')
      )
        throw conflict(
          'PAYMENT_CONFIRMATION_INVALID',
          'تعذر تأكيد المبلغ. حدّث الطلب وراجع حالته.',
        );
      const result = await this.orders.updateOne(
        { _id: order._id, storeId: store._id, version },
        {
          $set: {
            paymentStatus: 'PAID',
            paidAt: new Date(),
            paidBy: objectId(ownerId),
          },
          $inc: { version: 1 },
        },
        { session, runValidators: true },
      );
      if (result.modifiedCount !== 1)
        throw conflict('ORDER_CHANGED', 'تغير الطلب. حدّث الصفحة.');
    });
    return this.get(ownerId, value);
  }
  async releaseDigital(
    ownerId: string,
    value: string,
    slug: string,
    version: number,
  ) {
    await this.transact(async (session) => {
      const store = await this.owned(ownerId, session);
      const order = await this.orders
        .findOne({ _id: objectId(value), storeId: store._id })
        .session(session)
        .lean();
      if (!order) throw missing();
      const item = order.items.find(
        (i) => i.slug === slug && i.type === 'DIGITAL',
      );
      if (
        !item?.digitalDelivery ||
        order.paymentStatus !== 'PAID' ||
        order.status === 'CANCELLED'
      )
        throw conflict('PAYMENT_REQUIRED', 'أكد استلام المبلغ أولًا.');
      if (order.releasedDigitalSlugs?.includes(slug)) return;
      if (order.version !== version)
        throw conflict('ORDER_CHANGED', 'تغير الطلب. حدّث الصفحة.');
      const result = await this.orders.updateOne(
        { _id: order._id, storeId: store._id, version },
        { $addToSet: { releasedDigitalSlugs: slug }, $inc: { version: 1 } },
        { session, runValidators: true },
      );
      if (result.modifiedCount !== 1)
        throw conflict('ORDER_CHANGED', 'تغير الطلب. حدّث الصفحة.');
    });
    return this.get(ownerId, value);
  }
  async digitalDelivery(slug: string, token: string, productSlug: string) {
    const store = await this.publicStore(slug);
    const order = await this.orders
      .findOne({
        storeId: store._id,
        receiptHash: hash(token),
        receiptExpiresAt: { $gt: new Date() },
        paymentStatus: 'PAID',
        status: { $ne: 'CANCELLED' },
      })
      .lean();
    const item = order?.items.find(
      (i) => i.slug === productSlug && i.type === 'DIGITAL',
    );
    if (
      !order ||
      !item?.digitalDelivery ||
      !(
        item.digitalDelivery.automatic ||
        order.releasedDigitalSlugs?.includes(productSlug)
      )
    )
      throw missing();
    return { url: item.digitalDelivery.url };
  }
  async receipt(slug: string, token: string) {
    const store = await this.publicStore(slug);
    const order = await this.orders
      .findOne({
        storeId: store._id,
        receiptHash: hash(token),
        receiptExpiresAt: { $gt: new Date() },
      })
      .lean();
    if (!order) throw missing();
    const digitalItems = order.items
      .filter((i) => i.type === 'DIGITAL')
      .map((i) => ({
        slug: i.slug,
        name: i.name,
        available:
          order.paymentStatus === 'PAID' &&
          order.status !== 'CANCELLED' &&
          !!(
            i.digitalDelivery?.automatic ||
            order.releasedDigitalSlugs?.includes(i.slug)
          ),
      }));
    return {
      orderNumber: order.orderNumber,
      status: order.status,
      ...(digitalItems.length
        ? { paymentStatus: order.paymentStatus ?? 'UNPAID', digitalItems }
        : {}),
    };
  }
  async list(ownerId: string, query: OrderQuery) {
    const store = await this.owned(ownerId),
      filter = {
        storeId: store._id,
        ...(query.status ? { status: query.status } : {}),
        ...(query.q
          ? {
              orderNumber: {
                $regex: query.q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'),
                $options: 'i',
              },
            }
          : {}),
      };
    const [rows, total] = await Promise.all([
      this.orders
        .find(filter)
        .sort({ createdAt: -1, _id: -1 })
        .skip((query.page - 1) * query.pageSize)
        .limit(query.pageSize)
        .maxTimeMS(2000)
        .lean(),
      this.orders.countDocuments(filter).maxTimeMS(2000),
    ]);
    return {
      items: rows.map(summary),
      total,
      page: query.page,
      pageSize: query.pageSize,
    };
  }
  async get(ownerId: string, value: string): Promise<{ order: MerchantOrder }> {
    const store = await this.owned(ownerId);
    const order = await this.orders
      .findOne({ _id: objectId(value), storeId: store._id })
      .lean();
    if (!order) throw missing();
    return {
      order: {
        ...summary(order),
        requiresShipping: order.requiresShipping ?? true,
        paymentStatus: order.paymentStatus ?? 'UNPAID',
        paidAt: order.paidAt?.toISOString() ?? null,
        digitalItems: order.items
          .filter((i) => i.type === 'DIGITAL')
          .map((i) => ({
            slug: i.slug,
            name: i.name,
            released:
              order.paymentStatus === 'PAID' &&
              !!(
                i.digitalDelivery?.automatic ||
                order.releasedDigitalSlugs?.includes(i.slug)
              ),
            automatic: !!i.digitalDelivery?.automatic,
          })),
        customer: order.customer,
        items: order.items.map((i) => ({
          slug: i.slug,
          name: i.name,
          quantity: i.quantity,
          unitPricePiastres: i.unitPricePiastres,
          lineTotalPiastres: i.lineTotalPiastres,
        })),
        subtotalPiastres: order.subtotalPiastres,
        shippingFeePiastres: order.shippingFeePiastres,
        paymentMethod: order.paymentMethod,
        events: order.events.map((e) => ({
          from: e.from,
          to: e.to,
          at: e.at.toISOString(),
        })),
      },
    };
  }
  async update(ownerId: string, value: string, input: OrderUpdate) {
    await this.transact(async (session) => {
      const store = await this.owned(ownerId, session);
      await this.fence(store, session);
      const order = await this.orders
        .findOne({ _id: objectId(value), storeId: store._id })
        .session(session)
        .lean();
      if (!order) throw missing();
      if (
        order.version !== input.version ||
        !(
          order.requiresShipping === false && order.status === 'PROCESSING'
            ? ['DELIVERED', 'CANCELLED']
            : ORDER_TRANSITIONS[order.status]
        ).includes(input.status)
      )
        throw conflict(
          'ORDER_TRANSITION_INVALID',
          'حالة الطلب تغيرت أو الانتقال غير مسموح. حدّث الصفحة.',
        );
      if (input.status === 'CANCELLED') {
        if (
          order.paymentStatus === 'PAID' &&
          order.items.some((i) => i.type === 'DIGITAL')
        )
          throw conflict(
            'PAID_DIGITAL_CANCELLATION',
            'لا يمكن إلغاء طلب رقمي مدفوع دون معالجة استرداد المبلغ.',
          );
        if (order.stockRestored)
          throw conflict(
            'ORDER_ALREADY_RESTORED',
            'تمت استعادة المخزون بالفعل.',
          );
        for (const item of order.items) {
          const product = await this.products
            .findOneAndUpdate(
              {
                _id: item.productId,
                storeId: store._id,
                stockQuantity: { $lte: 1_000_000 - item.quantity },
              },
              { $inc: { stockQuantity: item.quantity, version: 1 } },
              { session, returnDocument: 'after', runValidators: true },
            )
            .lean();
          if (!product)
            throw conflict(
              'RESTORE_FAILED',
              'تعذر استعادة المخزون بأمان. راجع المنتج وحد المخزون.',
            );
          await this.movements.create(
            [
              {
                storeId: store._id,
                orderId: order._id,
                productId: item.productId,
                kind: 'RESTORE',
                delta: item.quantity,
                quantityAfter: product.stockQuantity,
              },
            ],
            { session },
          );
        }
      }
      if (
        input.status === 'DELIVERED' &&
        order.items.some((i) => i.type === 'DIGITAL') &&
        order.paymentStatus !== 'PAID'
      )
        throw conflict(
          'PAYMENT_REQUIRED',
          'أكد استلام المبلغ قبل تسليم المنتجات الرقمية.',
        );
      if (
        input.status === 'DELIVERED' &&
        order.items.some(
          (item) =>
            item.type === 'DIGITAL' &&
            !(
              item.digitalDelivery?.automatic ||
              order.releasedDigitalSlugs?.includes(item.slug)
            ),
        )
      )
        throw conflict(
          'DELIVERY_REQUIRED',
          'أتِح تسليم كل المنتجات الرقمية قبل وضع الطلب في حالة تم التسليم.',
        );
      const changed = await this.orders.updateOne(
        {
          _id: order._id,
          storeId: store._id,
          status: order.status,
          version: input.version,
        },
        {
          $set: {
            status: input.status,
            ...(input.status === 'CANCELLED' ? { stockRestored: true } : {}),
          },
          $inc: { version: 1 },
          $push: {
            events: {
              from: order.status,
              to: input.status,
              at: new Date(),
              actorId: objectId(ownerId),
            },
          },
        },
        { session, runValidators: true },
      );
      if (changed.modifiedCount !== 1)
        throw conflict(
          'ORDER_TRANSITION_INVALID',
          'حالة الطلب تغيرت. حدّث الصفحة.',
        );
    });
    return this.get(ownerId, value);
  }
}
