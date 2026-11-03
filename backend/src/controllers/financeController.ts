import { Request, Response, NextFunction } from 'express';
import { Prisma } from '@prisma/client';
import prisma from '../config/prisma';
import { AuthenticatedRequest, isSuperAdmin } from '../middleware/auth';
import { BadRequestError, ForbiddenError, NotFoundError } from '../utils/errors';

const idFor = (prefix: string, count: number) => `${prefix}-${String(count + 1).padStart(4, '0')}`;

function getCustomerScope(req: AuthenticatedRequest): Prisma.CustomerWhereInput {
  if (!req.user) throw new ForbiddenError('Authentication required');
  if (isSuperAdmin(req.user)) {
    const employeeId = typeof req.query.employeeId === 'string' ? req.query.employeeId.trim() : '';
    return employeeId ? { assignedEmployeeId: employeeId } : {};
  }
  if (!req.user.employeeId) throw new ForbiddenError('Employee workspace is not configured');
  return { assignedEmployeeId: req.user.employeeId };
}

function getAccountScope(req: AuthenticatedRequest): Prisma.AccountWhereInput {
  return { customer: { is: getCustomerScope(req) } };
}

function getPaymentScope(req: AuthenticatedRequest): Prisma.PaymentWhereInput {
  if (!req.user) throw new ForbiddenError('Authentication required');
  if (!isSuperAdmin(req.user)) {
    return {
      createdById: req.user.id,
      customer: { is: getCustomerScope(req) },
    };
  }
  return { customer: { is: getCustomerScope(req) } };
}

export class FinanceController {
  public static async dashboard(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const customerScope = getCustomerScope(req);
      const accountScope = getAccountScope(req);
      const paymentScope = getPaymentScope(req);
      const employeeId = isSuperAdmin(req.user!)
        ? (typeof req.query.employeeId === 'string' ? req.query.employeeId : undefined)
        : req.user!.id;
      const monthRangeStart = new Date();
      monthRangeStart.setDate(1);
      monthRangeStart.setHours(0, 0, 0, 0);
      monthRangeStart.setMonth(monthRangeStart.getMonth() - 5);

      const [
        customers,
        accounts,
        payments,
        accountTotals,
        paymentTotals,
        paymentMethods,
        recentPayments,
        monthlyPayments,
        recentLogs
      ] = await Promise.all([
        prisma.customer.count({ where: { status: 'ACTIVE', ...customerScope } }),
        prisma.account.count({ where: { status: { not: 'CLOSED' }, ...accountScope } }),
        prisma.payment.count({ where: { isReversed: false, ...paymentScope } }),
        prisma.account.aggregate({
          where: accountScope,
          _sum: { principalAmount: true, outstandingBalance: true, amountPaid: true, totalPayable: true },
        }),
        prisma.payment.aggregate({
          where: { isReversed: false, ...paymentScope },
          _sum: { amount: true },
        }),
        prisma.payment.groupBy({
          by: ['paymentMethod'],
          where: { isReversed: false, ...paymentScope },
          _sum: { amount: true },
        }),
        prisma.payment.findMany({
          where: { isReversed: false, ...paymentScope },
          orderBy: { paymentDate: 'desc' },
          take: 8,
          include: {
            customer: { select: { fullName: true, customerId: true, phone: true } },
            account: { select: { accountNumber: true, status: true } },
          },
        }),
        prisma.payment.findMany({
          where: { isReversed: false, paymentDate: { gte: monthRangeStart }, ...paymentScope },
          select: { amount: true, paymentDate: true, paymentMethod: true },
        }),
        prisma.auditLog.findMany({
          where: employeeId ? { userId: employeeId } : {},
          take: 8,
          orderBy: { timestamp: 'desc' },
          include: { user: { select: { fullName: true, username: true } } },
        }),
      ]);

      const principal = accountTotals._sum.principalAmount ?? 0;
      const outstanding = accountTotals._sum.outstandingBalance ?? 0;
      const recovered = paymentTotals._sum.amount ?? (accountTotals._sum.amountPaid ?? 0);

      // Method distribution
      const methodCounts: Record<string, number> = { UPI: 0, CASH: 0, BANK_TRANSFER: 0, CHEQUE: 0, OTHER: 0 };
      paymentMethods.forEach((paymentMethod) => {
        const method = paymentMethod.paymentMethod.toUpperCase();
        if (method in methodCounts) methodCounts[method] += paymentMethod._sum.amount ?? 0;
        else methodCounts.OTHER += paymentMethod._sum.amount ?? 0;
      });

      // Monthly aggregation for last 6 months
      const monthsMap: Record<string, number> = {};
      const now = new Date();
      for (let i = 5; i >= 0; i--) {
        const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
        const label = d.toLocaleString('en-US', { month: 'short' });
        monthsMap[label] = 0;
      }
      monthlyPayments.forEach((p) => {
        const d = new Date(p.paymentDate);
        const label = d.toLocaleString('en-US', { month: 'short' });
        if (label in monthsMap) {
          monthsMap[label] += p.amount;
        }
      });

      return res.json({
        status: 'success',
        data: {
          metrics: {
            customers,
            accounts,
            payments,
            principal,
            outstanding,
            recovered,
          },
          methodCounts,
          monthlyTrends: Object.entries(monthsMap).map(([month, total]) => ({ month, total })),
          recentPayments,
          recentLogs,
        },
      });
    } catch (error) {
      return next(error);
    }
  }

  public static async listCustomers(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const search = typeof req.query.search === 'string' ? req.query.search.trim() : '';
      const status = typeof req.query.status === 'string' ? req.query.status.trim() : '';
      const whereClause: Prisma.CustomerWhereInput = getCustomerScope(req);
      if (search) {
        whereClause.OR = [
          { fullName: { contains: search } },
          { customerId: { contains: search } },
          { phone: { contains: search } },
          { idNumber: { contains: search } },
        ];
      }
      if (status && status !== 'ALL') {
        whereClause.status = status;
      }

      const customers = await prisma.customer.findMany({
        where: Object.keys(whereClause).length > 0 ? whereClause : undefined,
        orderBy: { createdAt: 'desc' },
        include: {
          _count: { select: { accounts: true, payments: true } },
          accounts: {
            select: { id: true, accountNumber: true, outstandingBalance: true, status: true },
          },
        },
      });

      return res.json({ status: 'success', data: customers });
    } catch (error) {
      return next(error);
    }
  }

  public static async getCustomerDetails(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;
      const customer = await prisma.customer.findFirst({
        where: { id, ...getCustomerScope(req) },
        include: {
          accounts: {
            orderBy: { createdAt: 'desc' },
            include: {
              _count: { select: { payments: true } },
            },
          },
          payments: {
            where: {
              isReversed: false,
              ...(isSuperAdmin(req.user!) ? {} : { createdById: req.user!.id }),
            },
            orderBy: { paymentDate: 'desc' },
            take: 15,
            include: { account: { select: { accountNumber: true } } },
          },
        },
      });

      if (!customer) throw new NotFoundError('Customer not found');

      const totalBorrowed = customer.accounts.reduce((sum, a) => sum + a.totalPayable, 0);
      const totalOutstanding = customer.accounts.reduce((sum, a) => sum + a.outstandingBalance, 0);
      const totalRepaid = customer.accounts.reduce((sum, a) => sum + a.amountPaid, 0);

      return res.json({
        status: 'success',
        data: {
          ...customer,
          summary: {
            totalBorrowed,
            totalOutstanding,
            totalRepaid,
            activeLoans: customer.accounts.filter((a) => a.status === 'ACTIVE').length,
          },
        },
      });
    } catch (error) {
      return next(error);
    }
  }

  public static async assignCustomer(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;
      const { employeeId } = req.body as { employeeId: string | null };
      const customer = await prisma.$transaction(async (tx) => {
        if (employeeId) {
          const employee = await tx.employee.findFirst({
            where: { id: employeeId, archivedAt: null, user: { isActive: true } },
          });
          if (!employee) throw new BadRequestError('Choose an active employee');
        }

        const updated = await tx.customer.update({
          where: { id },
          data: { assignedEmployeeId: employeeId },
        });
        await tx.auditLog.create({
          data: {
            userId: req.user!.id,
            action: 'CUSTOMER_ASSIGN',
            entity: 'Customer',
            entityId: updated.id,
            ipAddress: req.ip,
            description: employeeId
              ? `Assigned customer ${updated.customerId} to employee ${employeeId}`
              : `Unassigned customer ${updated.customerId}`,
          },
        });
        return updated;
      });
      return res.json({ status: 'success', data: customer });
    } catch (error) {
      return next(error);
    }
  }

  public static async updateCustomer(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;
      const customer = await prisma.$transaction(async (tx) => {
        const updatedCount = await tx.customer.updateMany({
          where: { id, ...getCustomerScope(req) },
          data: {
            ...req.body,
            ...(req.body.dob ? { dob: new Date(req.body.dob) } : {}),
          },
        });
        if (updatedCount.count === 0) throw new NotFoundError('Customer not found');
        const updated = await tx.customer.findUniqueOrThrow({ where: { id } });
        await tx.auditLog.create({
          data: {
            userId: req.user!.id,
            action: 'CUSTOMER_UPDATE',
            entity: 'Customer',
            entityId: updated.id,
            ipAddress: req.ip,
            description: `Updated borrower profile ${updated.customerId}`,
          },
        });
        return updated;
      });
      return res.json({ status: 'success', data: customer });
    } catch (error) {
      return next(error);
    }
  }

  public static async createCustomer(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      if (!isSuperAdmin(req.user!) && 'assignedEmployeeId' in req.body) {
        throw new BadRequestError('Only the employer can assign customers');
      }
      const requestedAssignee = typeof req.body.assignedEmployeeId === 'string'
        ? req.body.assignedEmployeeId
        : undefined;
      const assignedEmployeeId = isSuperAdmin(req.user!)
        ? requestedAssignee ?? null
        : req.user!.employeeId;
      const customer = await prisma.$transaction(async (tx) => {
        if (requestedAssignee && isSuperAdmin(req.user!)) {
          const assignee = await tx.employee.findFirst({
            where: { id: requestedAssignee, archivedAt: null, user: { isActive: true } },
          });
          if (!assignee) throw new BadRequestError('Choose an active employee');
        }

        const count = await tx.customer.count();
        const created = await tx.customer.create({
          data: {
            ...req.body,
            customerId: idFor('CUST', count),
            dob: new Date(req.body.dob),
            createdById: req.user!.id,
            assignedEmployeeId,
          },
        });
        await tx.auditLog.create({
          data: {
            userId: req.user!.id,
            action: 'CUSTOMER_CREATE',
            entity: 'Customer',
            entityId: created.id,
            ipAddress: req.ip,
            description: `Created borrower profile: ${created.fullName} (${created.customerId})`,
          },
        });
        return created;
      });

      return res.status(201).json({ status: 'success', data: customer });
    } catch (error) {
      return next(error);
    }
  }

  public static async listAccounts(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const search = typeof req.query.search === 'string' ? req.query.search.trim() : '';
      const status = typeof req.query.status === 'string' ? req.query.status.trim() : '';
      const whereClause: Prisma.AccountWhereInput = getAccountScope(req);
      if (search) {
        whereClause.OR = [
          { accountNumber: { contains: search } },
          { customer: { is: { fullName: { contains: search } } } },
          { customer: { is: { customerId: { contains: search } } } },
          { customer: { is: { phone: { contains: search } } } },
        ];
      }
      if (status && status !== 'ALL') {
        whereClause.status = status;
      }

      const accounts = await prisma.account.findMany({
        where: Object.keys(whereClause).length > 0 ? whereClause : undefined,
        orderBy: { createdAt: 'desc' },
        include: {
          customer: {
            select: { fullName: true, customerId: true, phone: true, address: true },
          },
          _count: { select: { payments: true } },
        },
      });

      return res.json({ status: 'success', data: accounts });
    } catch (error) {
      return next(error);
    }
  }

  public static async getAccountDetails(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;
      const account = await prisma.account.findFirst({
        where: { id, ...getAccountScope(req) },
        include: {
          customer: true,
          payments: {
            where: {
              isReversed: false,
              ...(isSuperAdmin(req.user!) ? {} : { createdById: req.user!.id }),
            },
            orderBy: { paymentDate: 'desc' },
          },
        },
      });

      if (!account) throw new NotFoundError('Account not found');

      // Generate amortization breakdown
      const installmentsCount = account.durationMonths;
      const monthlyPrincipal = account.principalAmount / installmentsCount;
      const monthlyInterest = (account.totalPayable - account.principalAmount) / installmentsCount;
      const schedule = [];
      let curBalance = account.totalPayable;

      for (let i = 1; i <= installmentsCount; i++) {
        const dueDate = new Date(account.startDate);
        dueDate.setMonth(dueDate.getMonth() + i);
        curBalance = Math.max(0, curBalance - account.installmentAmount);

        schedule.push({
          installmentNumber: i,
          dueDate: dueDate.toISOString().slice(0, 10),
          amount: Math.round(account.installmentAmount),
          principalComponent: Math.round(monthlyPrincipal),
          interestComponent: Math.round(monthlyInterest),
          remainingBalance: Math.round(curBalance),
        });
      }

      return res.json({
        status: 'success',
        data: {
          ...account,
          amortizationSchedule: schedule,
        },
      });
    } catch (error) {
      return next(error);
    }
  }

  public static async createAccount(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const {
        customerId,
        principalAmount,
        interestRate,
        interestType,
        durationMonths,
        paymentFrequency,
        startDate,
        notes,
      } = req.body;

      const totalInterest =
        interestType === 'COMPOUND'
          ? principalAmount * (Math.pow(1 + interestRate / 100 / 12, durationMonths) - 1)
          : (principalAmount * (interestRate / 100) * durationMonths) / 12;

      const totalPayable = principalAmount + totalInterest;
      const installmentCount =
        paymentFrequency === 'DAILY'
          ? durationMonths * 30
          : paymentFrequency === 'WEEKLY'
          ? durationMonths * 4
          : durationMonths;
      const installmentAmount = totalPayable / installmentCount;

      const start = new Date(startDate);
      const end = new Date(start);
      end.setMonth(end.getMonth() + durationMonths);

      const nextDue = new Date(start);
      if (paymentFrequency === 'DAILY') nextDue.setDate(nextDue.getDate() + 1);
      else if (paymentFrequency === 'WEEKLY') nextDue.setDate(nextDue.getDate() + 7);
      else nextDue.setMonth(nextDue.getMonth() + 1);

      const account = await prisma.$transaction(async (tx) => {
        const customer = await tx.customer.findFirst({
          where: { id: customerId, ...getCustomerScope(req) },
        });
        if (!customer) throw new NotFoundError('Customer not found');

        const count = await tx.account.count();
        const created = await tx.account.create({
          data: {
            accountNumber: idFor('LOAN', count + 2000),
            customerId,
            principalAmount,
            interestRate,
            interestType,
            startDate: start,
            endDate: end,
            durationMonths,
            paymentFrequency,
            installmentAmount,
            totalPayable,
            outstandingBalance: totalPayable,
            nextDueDate: nextDue,
            notes,
            createdById: req.user!.id,
          },
          include: { customer: true },
        });

        await tx.auditLog.create({
          data: {
            userId: req.user!.id,
            action: 'ACCOUNT_CREATE',
            entity: 'Account',
            entityId: created.id,
            ipAddress: req.ip,
            description: `Disbursed loan ${created.accountNumber} of ₹${created.principalAmount} for ${customer.fullName}`,
          },
        });
        return created;
      });

      return res.status(201).json({ status: 'success', data: account });
    } catch (error) {
      return next(error);
    }
  }

  public static async listPayments(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const search = typeof req.query.search === 'string' ? req.query.search.trim() : '';
      const accountId = typeof req.query.accountId === 'string' ? req.query.accountId.trim() : '';
      const whereClause: Prisma.PaymentWhereInput = {
        isReversed: false,
        ...getPaymentScope(req),
      };
      if (accountId) {
        whereClause.accountId = accountId;
      }
      if (search) {
        whereClause.OR = [
          { receiptNumber: { contains: search } },
          { customer: { is: { fullName: { contains: search } } } },
          { customer: { is: { phone: { contains: search } } } },
          { account: { is: { accountNumber: { contains: search } } } },
          { referenceNumber: { contains: search } },
        ];
      }

      const payments = await prisma.payment.findMany({
        where: whereClause,
        orderBy: { paymentDate: 'desc' },
        include: {
          customer: { select: { fullName: true, customerId: true, phone: true } },
          account: { select: { accountNumber: true, outstandingBalance: true } },
          receipt: true,
        },
      });

      return res.json({ status: 'success', data: payments });
    } catch (error) {
      return next(error);
    }
  }

  public static async createPayment(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const { accountId, amount, paymentDate, paymentMethod, referenceNumber, notes } = req.body;
      const payment = await prisma.$transaction(async (transaction) => {
        const account = await transaction.account.findFirst({
          where: { id: accountId, ...getAccountScope(req) },
          include: { customer: true },
        });
        if (!account) throw new NotFoundError('Account not found');
        if (amount > account.outstandingBalance) {
          throw new BadRequestError(`Payment of ₹${amount} exceeds outstanding balance of ₹${Math.round(account.outstandingBalance)}`);
        }

        const newOutstanding = Math.max(0, account.outstandingBalance - amount);
        const newStatus = newOutstanding <= 0.01 ? 'COMPLETED' : 'ACTIVE';

        let nextDue = account.nextDueDate ? new Date(account.nextDueDate) : new Date();
        if (account.paymentFrequency === 'DAILY') nextDue.setDate(nextDue.getDate() + 1);
        else if (account.paymentFrequency === 'WEEKLY') nextDue.setDate(nextDue.getDate() + 7);
        else nextDue.setMonth(nextDue.getMonth() + 1);

        const balanceUpdate = await transaction.account.updateMany({
          where: {
            id: accountId,
            ...getAccountScope(req),
            outstandingBalance: { gte: amount },
          },
          data: {
            amountPaid: { increment: amount },
            outstandingBalance: newOutstanding,
            status: newStatus,
            nextDueDate: newStatus === 'COMPLETED' ? null : nextDue,
          },
        });
        if (balanceUpdate.count === 0) {
          throw new BadRequestError('The account balance changed or the account is no longer accessible.');
        }

        const receiptNumber = idFor('REC', await transaction.payment.count() + 5000);
        const created = await transaction.payment.create({
          data: {
            receiptNumber,
            customerId: account.customerId,
            accountId,
            amount,
            paymentDate: new Date(paymentDate),
            paymentMethod,
            referenceNumber,
            notes,
            createdById: req.user!.id,
            receipt: { create: { receiptNumber } },
          },
          include: { customer: true, account: true, receipt: true },
        });

        await transaction.auditLog.create({
          data: {
            userId: req.user!.id,
            action: 'PAYMENT_COLLECT',
            entity: 'Payment',
            entityId: created.id,
            ipAddress: req.ip,
            description: `Collected ₹${amount} via ${paymentMethod} (Receipt: ${receiptNumber}) for Account ${account.accountNumber} (${account.customer.fullName})`,
          },
        });
        return created;
      });

      return res.status(201).json({ status: 'success', data: payment });
    } catch (error) {
      return next(error);
    }
  }

  public static async reversePayment(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;
      const { reason } = req.body;

      const updated = await prisma.$transaction(async (tx) => {
        const payment = await tx.payment.findFirst({
          where: { id, ...getPaymentScope(req) },
          include: { account: true },
        });
        if (!payment) throw new NotFoundError('Payment not found');
        if (payment.isReversed) throw new BadRequestError('Payment is already reversed');

        const reversal = await tx.payment.updateMany({
          where: { id, isReversed: false, ...getPaymentScope(req) },
          data: {
            isReversed: true,
            reversedAt: new Date(),
            reversedById: req.user?.id,
            reversalReason: reason || 'Reversed by authorized admin',
          },
        });
        if (reversal.count === 0) throw new NotFoundError('Payment not found');

        await tx.account.update({
          where: { id: payment.accountId },
          data: {
            amountPaid: { decrement: payment.amount },
            outstandingBalance: { increment: payment.amount },
            status: 'ACTIVE',
          },
        });

        const reversed = await tx.payment.findUniqueOrThrow({ where: { id } });
        await tx.auditLog.create({
          data: {
            userId: req.user!.id,
            action: 'PAYMENT_REVERSE',
            entity: 'Payment',
            entityId: payment.id,
            ipAddress: req.ip,
            description: `Reversed receipt ${payment.receiptNumber} of ₹${payment.amount} for Account ${payment.account.accountNumber}. Reason: ${reason || 'N/A'}`,
          },
        });
        return reversed;
      });

      return res.json({ status: 'success', data: updated });
    } catch (error) {
      return next(error);
    }
  }

  public static async listAuditLogs(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const employeeId = isSuperAdmin(req.user!)
        ? (typeof req.query.employeeId === 'string' ? req.query.employeeId.trim() : '')
        : req.user!.id;
      const logs = await prisma.auditLog.findMany({
        where: employeeId ? { userId: employeeId } : undefined,
        take: 50,
        orderBy: { timestamp: 'desc' },
        include: {
          user: { select: { fullName: true, username: true, role: true } },
        },
      });
      return res.json({ status: 'success', data: logs });
    } catch (error) {
      return next(error);
    }
  }

  public static async calculateLoan(req: Request, res: Response, next: NextFunction) {
    try {
      const principal = Number(req.query.principal) || 50000;
      const rate = Number(req.query.rate) || 12;
      const months = Number(req.query.months) || 12;
      const type = String(req.query.type || 'FLAT').toUpperCase();

      let totalInterest = 0;
      let installmentAmount = 0;

      if (type === 'COMPOUND') {
        const monthlyRate = rate / 100 / 12;
        installmentAmount =
          (principal * monthlyRate * Math.pow(1 + monthlyRate, months)) /
          (Math.pow(1 + monthlyRate, months) - 1);
        const totalPayable = installmentAmount * months;
        totalInterest = totalPayable - principal;
      } else {
        totalInterest = (principal * (rate / 100) * months) / 12;
        const totalPayable = principal + totalInterest;
        installmentAmount = totalPayable / months;
      }

      const totalPayable = principal + totalInterest;

      const schedule = [];
      let balance = totalPayable;
      const monthlyPrincipal = principal / months;
      const monthlyInterest = totalInterest / months;

      for (let i = 1; i <= months; i++) {
        balance = Math.max(0, balance - installmentAmount);
        schedule.push({
          month: i,
          installment: Math.round(installmentAmount),
          principal: Math.round(monthlyPrincipal),
          interest: Math.round(monthlyInterest),
          balance: Math.round(balance),
        });
      }

      return res.json({
        status: 'success',
        data: {
          principal,
          rate,
          months,
          type,
          installmentAmount: Math.round(installmentAmount),
          totalInterest: Math.round(totalInterest),
          totalPayable: Math.round(totalPayable),
          schedule,
        },
      });
    } catch (error) {
      return next(error);
    }
  }

  public static async exportData(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const { type } = req.params;

      if (type === 'customers') {
        const customers = await prisma.customer.findMany({
          where: getCustomerScope(req),
          include: { _count: { select: { accounts: true } } },
        });
        const csvHeader = 'Customer ID,Full Name,Phone,Address,ID Type,ID Number,Status,Accounts Count,Created At\n';
        const csvRows = customers
          .map((c) =>
            `"${c.customerId}","${c.fullName}","${c.phone}","${c.address}","${c.idType}","${c.idNumber}","${c.status}","${c._count.accounts}","${c.createdAt.toISOString()}"`
          )
          .join('\n');
        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', 'attachment; filename="customers.csv"');
        return res.send(csvHeader + csvRows);
      }

      if (type === 'accounts') {
        const accounts = await prisma.account.findMany({
          where: getAccountScope(req),
          include: { customer: { select: { fullName: true, customerId: true } } },
        });
        const csvHeader = 'Account Number,Customer ID,Customer Name,Principal Amount,Interest Rate %,Duration Months,Installment Amount,Total Payable,Amount Paid,Outstanding Balance,Status,Start Date\n';
        const csvRows = accounts
          .map((a) =>
            `"${a.accountNumber}","${a.customer.customerId}","${a.customer.fullName}","${a.principalAmount}","${a.interestRate}","${a.durationMonths}","${a.installmentAmount}","${a.totalPayable}","${a.amountPaid}","${a.outstandingBalance}","${a.status}","${a.startDate.toISOString()}"`
          )
          .join('\n');
        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', 'attachment; filename="loans.csv"');
        return res.send(csvHeader + csvRows);
      }

      if (type === 'payments') {
        const payments = await prisma.payment.findMany({
          where: { isReversed: false, ...getPaymentScope(req) },
          include: {
            customer: { select: { fullName: true } },
            account: { select: { accountNumber: true } },
          },
        });
        const csvHeader = 'Receipt Number,Borrower,Loan Account,Amount,Date,Method,Reference Number,Notes\n';
        const csvRows = payments
          .map((p) =>
            `"${p.receiptNumber}","${p.customer.fullName}","${p.account.accountNumber}","${p.amount}","${p.paymentDate.toISOString()}","${p.paymentMethod}","${p.referenceNumber || ''}","${p.notes || ''}"`
          )
          .join('\n');
        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', 'attachment; filename="payments.csv"');
        return res.send(csvHeader + csvRows);
      }

      throw new BadRequestError('Invalid export type. Use customers, accounts, or payments.');
    } catch (error) {
      return next(error);
    }
  }
}