import {
  BadRequestException,
  ConflictException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';

import { PrismaService } from '../prisma/prisma.module';
import { error } from '../utils/http-error.util';
import { SignUpDto, LoginDto } from './dto/login.dto';

@Injectable()
export class AuthService {
  constructor(
    private prisma: PrismaService,
    private jwt: JwtService,
  ) {}

  private signSession(userId: string, email: string): Promise<string> {
    return this.jwt.signAsync({ sub: userId, email });
  }

  async signUp(dto: SignUpDto): Promise<{ userId: string; token: string }> {
    const existing = await this.prisma.user.findUnique({ where: { email: dto.email } });
    if (existing) {
      throw error('email_taken', 'An account with this email already exists.', 409);
    }

    const passwordHash = await bcrypt.hash(dto.password, 10);

    // Replaces the migration-010 DB trigger: create user + profile + first
    // learning language atomically at signup time.
    const user = await this.prisma.$transaction(async (tx) => {
      const created = await tx.user.create({
        data: { email: dto.email, passwordHash },
      });

      await tx.profile.create({
        data: {
          id: created.id,
          nativeLanguage: 'en',
          targetLanguage: 'en',
          onboarded: false,
        },
      });

      await tx.userLanguage.create({
        data: { userId: created.id, language: 'en' },
      });

      return created;
    }).catch((e) => {
      if (String(e?.code) === 'P2002') {
        throw error('email_taken', 'An account with this email already exists.', 409);
      }
      throw e;
    });

    const token = await this.signSession(user.id, user.email);
    return { userId: user.id, token };
  }

  async login(dto: LoginDto): Promise<{ userId: string; email: string; token: string }> {
    const user = await this.prisma.user.findUnique({ where: { email: dto.email } });
    const valid = user
      ? await bcrypt.compare(dto.password, user.passwordHash)
      : false;

    if (!user || !valid) {
      throw error('invalid_credentials', 'Email or password is incorrect.', 401);
    }

    const token = await this.signSession(user.id, user.email);
    return { userId: user.id, email: user.email, token };
  }

  async getMe(userId: string): Promise<{ id: string; email: string }> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new UnauthorizedException();
    return { id: user.id, email: user.email };
  }

  async requestPasswordReset(input: { email: string }): Promise<{ success: true }> {
    // Never reveal whether the email exists.
    const user = await this.prisma.user.findUnique({ where: { email: input.email } });
    if (!user) return { success: true };

    const token = await this.jwt.signAsync(
      { sub: user.id, purpose: 'password_reset' },
      { expiresIn: '1h' },
    );

    const origin = process.env.PASSWORD_RESET_ORIGIN ?? 'http://localhost:5173';
    const resetLink = `${origin}/reset-password?token=${token}`;

    // SMTP is optional — when not configured the link is logged for testing.
    if (process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS) {
      try {
        // Lazy require keeps nodemailer optional without a hard dependency.
        const nodemailer = require('nodemailer');
        const transport = nodemailer.createTransport({
          host: process.env.SMTP_HOST,
          port: Number(process.env.SMTP_PORT ?? 587),
          auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
        });
        await transport.sendMail({
          from: process.env.SMTP_FROM ?? process.env.SMTP_USER,
          to: user.email,
          subject: 'LexiFlow password reset',
          text: `Reset your password: ${resetLink}`,
          html: `<p>Reset your password:</p><p><a href="${resetLink}">${resetLink}</a></p>`,
        });
      } catch (e) {
        console.error('[auth] Failed to send reset email:', e);
      }
    } else {
      console.log(`[auth] SMTP not configured — password reset link for ${user.email}: ${resetLink}`);
    }

    return { success: true };
  }

  async confirmPasswordReset(input: {
    token: string;
    newPassword: string;
  }): Promise<{ success: true }> {
    let payload: { sub?: string; purpose?: string };
    try {
      payload = await this.jwt.verifyAsync(input.token);
    } catch {
      throw error('expired_token', 'This reset link has expired. Please request a new one.', 401);
    }

    if (payload.purpose !== 'password_reset' || !payload.sub) {
      throw error('expired_token', 'This reset link has expired. Please request a new one.', 401);
    }

    if (!input.newPassword || input.newPassword.length < 6) {
      throw error('weak_password', 'Password must be at least 6 characters long.', 400);
    }

    const exists = await this.prisma.user.findUnique({ where: { id: payload.sub } });
    if (!exists) throw new BadRequestException();

    const passwordHash = await bcrypt.hash(input.newPassword, 10);
    await this.prisma.user.update({ where: { id: payload.sub }, data: { passwordHash } });

    return { success: true };
  }
}
