import { Router } from 'express';
import { z } from 'zod';
import { authenticate, requireEmployer, requirePasswordChangeComplete } from '../middleware/auth';
import { validate } from '../middleware/validate';
import { FinanceController } from '../controllers/financeController';

const router = Router();

const customerSchema = z.object({
  body: z.object({
    fullName: z.string().min(2),
    phone: z.string().min(5),
    address: z.string().min(3),
    dob: z.string().min(1),
    idType: z.string().min(1),
    idNumber: z.string().min(1),
    assignedEmployeeId: z.string().min(1).optional(),
    altPhone: z.string().optional(),
    notes: z.string().optional(),
  }).strict(),
});

const accountSchema = z.object({
  body: z.object({
    customerId: z.string().min(1),
    principalAmount: z.number().positive(),
    interestRate: z.number().nonnegative(),
    interestType: z.enum(['SIMPLE', 'COMPOUND', 'FLAT']),
    durationMonths: z.number().int().positive(),
    paymentFrequency: z.enum(['DAILY', 'WEEKLY', 'MONTHLY']),
    startDate: z.string().min(1),
    notes: z.string().optional(),
  }).strict(),
});

const paymentSchema = z.object({
  body: z.object({
    accountId: z.string().min(1),
    amount: z.number().positive(),
    paymentDate: z.string().min(1),
    paymentMethod: z.enum(['CASH', 'UPI', 'BANK_TRANSFER', 'CHEQUE', 'OTHER']),
    referenceNumber: z.string().optional(),
    notes: z.string().optional(),
  }).strict(),
});

const customerAssignmentSchema = z.object({
  params: z.object({ id: z.string().min(1) }),
  body: z.object({ employeeId: z.string().min(1).nullable() }).strict(),
});

const customerUpdateSchema = z.object({
  params: z.object({ id: z.string().min(1) }),
  body: z.object({
    fullName: z.string().min(2).max(120).optional(),
    phone: z.string().min(5).max(40).optional(),
    address: z.string().min(3).max(500).optional(),
    dob: z.string().min(1).refine((value) => !Number.isNaN(Date.parse(value)), 'Invalid date').optional(),
    idType: z.string().min(1).max(40).optional(),
    idNumber: z.string().min(1).max(100).optional(),
    altPhone: z.string().max(40).nullable().optional(),
    notes: z.string().max(2000).nullable().optional(),
  }).strict().refine((body) => Object.keys(body).length > 0, 'At least one field is required'),
});

router.use(authenticate, requirePasswordChangeComplete);

// Analytics & Dashboard
router.get('/dashboard', FinanceController.dashboard);
router.get('/audit-logs', FinanceController.listAuditLogs);
router.get('/calculator', FinanceController.calculateLoan);
router.get('/export/:type', FinanceController.exportData);

// Customers
router.get('/customers', FinanceController.listCustomers);
router.get('/customers/:id', FinanceController.getCustomerDetails);
router.post('/customers', validate(customerSchema), FinanceController.createCustomer);
router.patch('/customers/:id', validate(customerUpdateSchema), FinanceController.updateCustomer);
router.patch('/customers/:id/assignment', requireEmployer, validate(customerAssignmentSchema), FinanceController.assignCustomer);

// Accounts (Loans)
router.get('/accounts', FinanceController.listAccounts);
router.get('/accounts/:id', FinanceController.getAccountDetails);
router.post('/accounts', validate(accountSchema), FinanceController.createAccount);

// Payments & Receipts
router.get('/payments', FinanceController.listPayments);
router.post('/payments', validate(paymentSchema), FinanceController.createPayment);
router.post('/payments/:id/reverse', FinanceController.reversePayment);

export default router;