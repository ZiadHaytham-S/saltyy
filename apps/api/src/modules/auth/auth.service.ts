import {
  Injectable,
  ConflictException,
  UnauthorizedException,
} from '@nestjs/common';
import type { OnModuleInit } from '@nestjs/common';
import { InjectModel, InjectConnection } from '@nestjs/mongoose';
import type { Model, Connection } from 'mongoose';
import { Types } from 'mongoose';
import { randomBytes } from 'node:crypto';
import * as argon2 from 'argon2';
import type { RegisterInput, LoginInput, Merchant } from '@sallty/contracts';
import { USER, SESSION } from '../../database/schemas.js';
import type { User, Session } from '../../database/schemas.js';
import { tokenHash, SESSION_SECONDS, IDLE_MS } from '../../security/cookies.js';
import { isDuplicateKey } from '../../common/validation.js';
export const hashOptions = {
  type: argon2.argon2id,
  memoryCost: 19456,
  timeCost: 2,
  parallelism: 1,
} as const;
function publicUser(user: User): Merchant {
  return {
    emailVerified: Boolean(user.emailVerifiedAt),
    id: user._id.toString(),
    name: user.name,
    email: user.email,
    phone: user.phone,
    country: user.country ?? 'EG',
    role: user.role ?? 'MERCHANT',
  };
}
@Injectable()
export class AuthService implements OnModuleInit {
  private dummyHash = '';
  constructor(
    @InjectModel(USER) private readonly users: Model<User>,
    @InjectModel(SESSION) private readonly sessions: Model<Session>,
    @InjectConnection() private readonly connection: Connection,
  ) {}
  async onModuleInit() {
    this.dummyHash = await argon2.hash(randomBytes(32), hashOptions);
  }
  private sessionData(userId: Types.ObjectId, raw: string) {
    return {
      userId,
      tokenHash: tokenHash(raw),
      expiresAt: new Date(Date.now() + SESSION_SECONDS * 1000),
      lastSeenAt: new Date(),
    };
  }
  async register(input: RegisterInput, previousToken?: string) {
    const passwordHash = await argon2.hash(input.password, hashOptions);
    const raw = randomBytes(32).toString('base64url');
    const id = new Types.ObjectId();
    try {
      await this.connection.transaction(async (session) => {
        await this.users.create(
          [
            {
              _id: id,
              name: input.name,
              email: input.email,
              phone: input.phone,
              country: input.country,
              passwordHash,
            },
          ],
          { session },
        );
        if (previousToken)
          await this.sessions.deleteOne(
            { tokenHash: tokenHash(previousToken) },
            { session },
          );
        await this.sessions.create([this.sessionData(id, raw)], { session });
      });
    } catch (error) {
      if (isDuplicateKey(error))
        throw new ConflictException({
          code: 'EMAIL_EXISTS',
          message: 'الإيميل ده مستخدم بالفعل، جرّب تسجيل الدخول',
        });
      throw error;
    }
    return {
      user: {
        emailVerified: false,
        id: id.toString(),
        name: input.name,
        email: input.email,
        phone: input.phone,
        country: input.country,
        role: 'MERCHANT' as const,
      },
      token: raw,
    };
  }
  async login(input: LoginInput, previousToken?: string) {
    const user = await this.users
      .findOne({ email: input.email })
      .select('+passwordHash')
      .lean();
    const correct = await argon2.verify(
      user?.passwordHash ?? this.dummyHash,
      input.password,
    );
    if (!user || !correct)
      throw new UnauthorizedException({
        code: 'INVALID_CREDENTIALS',
        message: 'الإيميل أو كلمة المرور مش صحيحين',
      });
    const raw = randomBytes(32).toString('base64url');
    await this.connection.transaction(async (session) => {
      const current = await this.users.findOneAndUpdate(
        { _id: user._id, passwordHash: user.passwordHash },
        { $inc: { authRevision: 1 } },
        { session },
      );
      if (!current)
        throw new UnauthorizedException({
          code: 'INVALID_CREDENTIALS',
          message: 'بيانات تسجيل الدخول غير صحيحة',
        });
      if (previousToken)
        await this.sessions.deleteOne(
          { tokenHash: tokenHash(previousToken) },
          { session },
        );
      await this.sessions.create([this.sessionData(user._id, raw)], {
        session,
      });
    });
    return { user: publicUser(user), token: raw };
  }
  async authenticate(raw?: string) {
    if (!raw) return null;
    const now = new Date();
    const session = await this.sessions
      .findOneAndUpdate(
        {
          tokenHash: tokenHash(raw),
          expiresAt: { $gt: now },
          lastSeenAt: { $gt: new Date(now.getTime() - IDLE_MS) },
        },
        { $set: { lastSeenAt: now } },
        { returnDocument: 'after' },
      )
      .lean();
    const user = session
      ? await this.users.findById(session.userId).lean()
      : null;
    if (!session || !user) return null;
    return {
      userId: session.userId.toString(),
      emailVerified: Boolean(user.emailVerifiedAt),
      sessionId: session._id.toString(),
      role: user.role ?? 'MERCHANT',
    };
  }
  async me(userId: string) {
    const user = await this.users.findById(userId).lean();
    if (!user)
      throw new UnauthorizedException({
        code: 'UNAUTHENTICATED',
        message: 'سجّل دخولك الأول',
      });
    return publicUser(user);
  }
  async logout(sessionId: string) {
    await this.sessions.deleteOne({ _id: sessionId });
  }
}
