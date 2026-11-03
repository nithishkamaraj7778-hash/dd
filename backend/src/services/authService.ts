import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import prisma from '../config/prisma';
import { UnauthorizedError, BadRequestError, ConflictError } from '../utils/errors';

export class AuthService {
  private static readonly SALT_ROUNDS = 10;

  public static async hashPassword(password: string): Promise<string> {
    return bcrypt.hash(password, this.SALT_ROUNDS);
  }

  public static async comparePasswords(password: string, hash: string): Promise<boolean> {
    return bcrypt.compare(password, hash);
  }

  public static generateToken(payload: { id: string; role: string }): string {
    const jwtSecret = process.env.JWT_SECRET || 'your_jwt_secret_key_here_change_in_production';
    const expiresIn = process.env.JWT_EXPIRES_IN || '8h';
    return jwt.sign(payload, jwtSecret, { expiresIn: expiresIn as any });
  }

  public static async login(username: string, password: string) {
    const user = await prisma.user.findUnique({
      where: { username },
    });

    if (!user || !user.isActive) {
      throw new UnauthorizedError('Invalid credentials or inactive user account');
    }

    const isPasswordValid = await this.comparePasswords(password, user.passwordHash);
    if (!isPasswordValid) {
      throw new UnauthorizedError('Invalid credentials or inactive user account');
    }

    const token = this.generateToken({ id: user.id, role: user.role });

    return {
      token,
      user: {
        id: user.id,
        username: user.username,
        fullName: user.fullName,
        role: user.role,
      },
    };
  }

  public static async register(username: string, password: string, fullName: string, role: string) {
    // Check if role is valid
    const validRoles = ['SUPERADMIN', 'ADMIN', 'MANAGER', 'EMPLOYEE'];
    if (!validRoles.includes(role)) {
      throw new BadRequestError(`Invalid role. Choose from: ${validRoles.join(', ')}`);
    }

    // Check if user already exists
    const existingUser = await prisma.user.findUnique({
      where: { username },
    });

    if (existingUser) {
      throw new ConflictError('Username is already taken');
    }

    const passwordHash = await this.hashPassword(password);

    const user = await prisma.user.create({
      data: {
        username,
        passwordHash,
        fullName,
        role,
      },
    });

    return {
      id: user.id,
      username: user.username,
      fullName: user.fullName,
      role: user.role,
      createdAt: user.createdAt,
    };
  }

  public static async listAdmins() {
    const admins = await prisma.user.findMany({
      where: {
        role: { in: ['ADMIN', 'MANAGER', 'EMPLOYEE'] },
        isActive: true,
      },
      select: {
        id: true,
        username: true,
        fullName: true,
        role: true,
        isActive: true,
        createdAt: true,
      },
      orderBy: { fullName: 'asc' },
    });
    return admins;
  }

  public static async getUserById(id: string) {
    const user = await prisma.user.findUnique({
      where: { id },
      select: {
        id: true,
        username: true,
        fullName: true,
        role: true,
        isActive: true,
        createdAt: true,
      },
    });

    if (!user) {
      throw new UnauthorizedError('User profile not found');
    }

    return user;
  }
}
