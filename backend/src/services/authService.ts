import { randomBytes } from 'crypto';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import prisma from '../config/prisma';
import { AuthUser, jwtSecret } from '../middleware/auth';
import { BadRequestError, ConflictError, NotFoundError, UnauthorizedError } from '../utils/errors';

const SALT_ROUNDS = 12;

function createToken(user: Pick<AuthUser, 'id' | 'role' | 'tokenVersion'>): string {
  return jwt.sign(user, jwtSecret(), { expiresIn: '8h' });
}

function employeeUser(user: {
  id: string;
  username: string;
  fullName: string;
  role: string;
  tokenVersion: number;
  mustChangePassword: boolean;
  employeeProfile: { id: string; employeeId: string; phone?: string | null } | null;
}) {
  return {
    id: user.id,
    username: user.username,
    fullName: user.fullName,
    role: user.role,
    employeeId: user.employeeProfile?.employeeId,
    phone: user.employeeProfile?.phone ?? null,
    mustChangePassword: user.mustChangePassword,
  };
}

export class AuthService {
  public static async login(username: string, password: string) {
    const user = await prisma.user.findUnique({
      where: { username },
      include: { employeeProfile: { select: { id: true, employeeId: true, phone: true, archivedAt: true } } },
    });

    if (
      !user
      || !user.isActive
      || (user.role !== 'SUPERADMIN' && (!user.employeeProfile || user.employeeProfile.archivedAt))
      || !await bcrypt.compare(password, user.passwordHash)
    ) {
      throw new UnauthorizedError('Invalid credentials or inactive user account');
    }

    if (user.role !== 'SUPERADMIN' && user.role !== 'EMPLOYEE') {
      throw new UnauthorizedError('Invalid credentials or inactive user account');
    }

    const role = user.role;
    await prisma.auditLog.create({
      data: {
        userId: user.id,
        action: 'LOGIN',
        entity: 'User',
        entityId: user.id,
        description: `${role === 'SUPERADMIN' ? 'Employer' : 'Employee'} signed in`,
      },
    });

    return {
      token: createToken({ id: user.id, role, tokenVersion: user.tokenVersion }),
      user: employeeUser({ ...user, role }),
    };
  }

  public static async listEmployees(search = '') {
    return prisma.employee.findMany({
      where: {
        ...(search
          ? {
              OR: [
                { employeeId: { contains: search } },
                { user: { fullName: { contains: search } } },
                { user: { username: { contains: search } } },
              ],
            }
          : {}),
      },
      include: {
        user: {
          select: { id: true, username: true, fullName: true, isActive: true, createdAt: true },
        },
        _count: { select: { customers: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  public static async createEmployee(actorId: string, input: {
    username: string;
    fullName: string;
    phone?: string;
    title?: string;
  }) {
    const existing = await prisma.user.findUnique({ where: { username: input.username } });
    if (existing) throw new ConflictError('Username is already taken');

    const temporaryPassword = randomBytes(12).toString('base64url');
    const passwordHash = await bcrypt.hash(temporaryPassword, SALT_ROUNDS);
    const employeeId = `EMP-${randomBytes(4).toString('hex').toUpperCase()}`;

    const employee = await prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          username: input.username,
          fullName: input.fullName,
          passwordHash,
          role: 'EMPLOYEE',
          mustChangePassword: true,
        },
      });
      const profile = await tx.employee.create({
        data: {
          id: user.id,
          employeeId,
          userId: user.id,
          phone: input.phone,
          title: input.title,
        },
        include: { user: { select: { id: true, username: true, fullName: true, isActive: true, createdAt: true } } },
      });
      await tx.auditLog.create({
        data: {
          userId: actorId,
          action: 'EMPLOYEE_CREATE',
          entity: 'Employee',
          entityId: profile.id,
          description: `Created employee account ${employeeId}`,
        },
      });
      return profile;
    });

    return { employee, temporaryPassword };
  }

  public static async updateEmployee(
    actorId: string,
    employeeId: string,
    input: { username?: string; fullName?: string; phone?: string | null; title?: string | null }
  ) {
    const profile = await prisma.employee.findUnique({ where: { id: employeeId } });
    if (!profile || profile.archivedAt) throw new NotFoundError('Employee not found');

    return prisma.$transaction(async (tx) => {
      const employee = await tx.employee.update({
        where: { id: employeeId },
        data: {
          phone: input.phone,
          title: input.title,
          user: {
            update: {
              username: input.username,
              fullName: input.fullName,
            },
          },
        },
        include: {
          user: {
            select: { id: true, username: true, fullName: true, isActive: true, createdAt: true },
          },
        },
      });
      await tx.auditLog.create({
        data: {
          userId: actorId,
          action: 'EMPLOYEE_UPDATE',
          entity: 'Employee',
          entityId: employeeId,
          description: `Updated employee account ${employee.employeeId}`,
        },
      });
      return employee;
    });
  }

  public static async setEmployeeActive(actorId: string, employeeId: string, isActive: boolean) {
    const employee = await prisma.employee.findUnique({ where: { id: employeeId } });
    if (!employee || employee.archivedAt) throw new NotFoundError('Employee not found');

    return prisma.$transaction(async (tx) => {
      const updated = await tx.user.update({
        where: { id: employee.userId },
        data: { isActive, tokenVersion: { increment: 1 } },
        select: { id: true, username: true, fullName: true, isActive: true, createdAt: true },
      });
      await tx.auditLog.create({
        data: {
          userId: actorId,
          action: isActive ? 'EMPLOYEE_ACTIVATE' : 'EMPLOYEE_DEACTIVATE',
          entity: 'Employee',
          entityId: employeeId,
          description: `${isActive ? 'Activated' : 'Deactivated'} employee ${employee.employeeId}`,
        },
      });
      return { ...employee, user: updated };
    });
  }

  public static async archiveEmployee(actorId: string, employeeId: string) {
    const employee = await prisma.employee.findUnique({ where: { id: employeeId } });
    if (!employee || employee.archivedAt) throw new NotFoundError('Employee not found');

    return prisma.$transaction(async (tx) => {
      const [profile, user] = await Promise.all([
        tx.employee.update({ where: { id: employeeId }, data: { archivedAt: new Date() } }),
        tx.user.update({
          where: { id: employee.userId },
          data: { isActive: false, tokenVersion: { increment: 1 } },
          select: { id: true, username: true, fullName: true, isActive: true, createdAt: true },
        }),
      ]);
      await tx.auditLog.create({
        data: {
          userId: actorId,
          action: 'EMPLOYEE_ARCHIVE',
          entity: 'Employee',
          entityId: employeeId,
          description: `Archived employee ${employee.employeeId}`,
        },
      });
      return { ...profile, user };
    });
  }

  public static async resetEmployeePassword(actorId: string, employeeId: string) {
    const employee = await prisma.employee.findUnique({ where: { id: employeeId } });
    if (!employee || employee.archivedAt) throw new NotFoundError('Employee not found');

    const temporaryPassword = randomBytes(12).toString('base64url');
    const passwordHash = await bcrypt.hash(temporaryPassword, SALT_ROUNDS);
    await prisma.$transaction([
      prisma.user.update({
        where: { id: employee.userId },
        data: { passwordHash, mustChangePassword: true, tokenVersion: { increment: 1 } },
      }),
      prisma.auditLog.create({
        data: {
          userId: actorId,
          action: 'EMPLOYEE_PASSWORD_RESET',
          entity: 'Employee',
          entityId: employeeId,
          description: `Reset password for employee ${employee.employeeId}`,
        },
      }),
    ]);
    return { temporaryPassword };
  }

  public static async changePassword(
    userId: string,
    currentPassword: string,
    newPassword: string
  ) {
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user || !await bcrypt.compare(currentPassword, user.passwordHash)) {
      throw new UnauthorizedError('Current password is incorrect');
    }
    if (currentPassword === newPassword) {
      throw new BadRequestError('New password must be different from the current password');
    }

    const passwordHash = await bcrypt.hash(newPassword, SALT_ROUNDS);
    const updated = await prisma.$transaction(async (tx) => {
      const saved = await tx.user.update({
        where: { id: userId },
        data: {
          passwordHash,
          mustChangePassword: false,
          tokenVersion: { increment: 1 },
        },
        include: { employeeProfile: { select: { id: true, employeeId: true, phone: true } } },
      });
      await tx.auditLog.create({
        data: {
          userId,
          action: 'PASSWORD_CHANGE',
          entity: 'User',
          entityId: userId,
          description: 'Changed account password',
        },
      });
      return saved;
    });
    const role = updated.role === 'SUPERADMIN' ? 'SUPERADMIN' : 'EMPLOYEE';
    return {
      token: createToken({ id: updated.id, role, tokenVersion: updated.tokenVersion }),
      user: employeeUser({ ...updated, role }),
    };
  }

  public static async updateProfile(
    userId: string,
    input: { fullName?: string; phone?: string | null }
  ) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: { employeeProfile: true },
    });
    if (!user || !user.isActive) throw new NotFoundError('User profile not found');

    return prisma.$transaction(async (tx) => {
      const updated = await tx.user.update({
        where: { id: userId },
        data: { fullName: input.fullName },
        include: { employeeProfile: { select: { id: true, employeeId: true, phone: true } } },
      });
      if (updated.employeeProfile && input.phone !== undefined) {
        await tx.employee.update({
          where: { id: updated.employeeProfile.id },
          data: { phone: input.phone },
        });
      }
      await tx.auditLog.create({
        data: {
          userId,
          action: 'PROFILE_UPDATE',
          entity: 'User',
          entityId: userId,
          description: 'Updated profile',
        },
      });
      return employeeUser({
        ...updated,
        role: updated.role === 'SUPERADMIN' ? updated.role : 'EMPLOYEE',
      });
    });
  }

  public static async getUserById(id: string) {
    const user = await prisma.user.findUnique({
      where: { id },
      include: { employeeProfile: { select: { id: true, employeeId: true, phone: true } } },
    });
    if (!user || !user.isActive) throw new NotFoundError('User profile not found');
    return employeeUser({ ...user, role: user.role === 'SUPERADMIN' ? user.role : 'EMPLOYEE' });
  }

  public static async employeeReport(employeeId: string) {
    const employee = await prisma.employee.findUnique({
      where: { id: employeeId },
      include: {
        user: { select: { id: true, username: true, fullName: true, isActive: true, createdAt: true } },
      },
    });
    if (!employee) throw new NotFoundError('Employee not found');

    const monthStart = new Date();
    monthStart.setDate(1);
    monthStart.setHours(0, 0, 0, 0);

    const [customerCount, accountTotals, payments, recentActivity] = await Promise.all([
      prisma.customer.count({ where: { assignedEmployeeId: employee.id } }),
      prisma.account.aggregate({
        where: { customer: { is: { assignedEmployeeId: employee.id } } },
        _sum: { principalAmount: true, outstandingBalance: true },
        _count: { _all: true },
      }),
      prisma.payment.findMany({
        where: { createdById: employee.userId, isReversed: false },
        select: { amount: true, paymentDate: true },
        orderBy: { paymentDate: 'desc' },
      }),
      prisma.auditLog.findMany({
        where: { userId: employee.userId },
        orderBy: { timestamp: 'desc' },
        take: 20,
        select: { action: true, entity: true, description: true, timestamp: true },
      }),
    ]);

    return {
    employee: {
      employeeId: employee.employeeId,
        title: employee.title,
        phone: employee.phone,
        archivedAt: employee.archivedAt,
        ...employee.user,
      },
      metrics: {
        customers: customerCount,
        accounts: accountTotals._count._all,
        principal: accountTotals._sum.principalAmount ?? 0,
        outstanding: accountTotals._sum.outstandingBalance ?? 0,
        transactions: payments.length,
        recovered: payments.reduce((sum, payment) => sum + payment.amount, 0),
        recoveredThisMonth: payments
          .filter((payment) => payment.paymentDate >= monthStart)
          .reduce((sum, payment) => sum + payment.amount, 0),
      },
      recentActivity,
    };
  }

  public static async logout(userId: string) {
    await prisma.$transaction([
      prisma.user.update({ where: { id: userId }, data: { tokenVersion: { increment: 1 } } }),
      prisma.auditLog.create({
        data: {
          userId,
          action: 'LOGOUT',
          entity: 'User',
          entityId: userId,
          description: 'Signed out',
        },
      }),
    ]);
  }
}
