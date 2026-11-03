import { Router } from 'express';
import { z } from 'zod';
import { authenticate } from '../middleware/auth';
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
    altPhone: z.string().optional(),
    notes: z.string().optional(),
  }),
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
  }),
});

const paymentSchema = z.object({
  body: z.object({
    accountId: z.string().min(1),
    amount: z.number().positive(),
    paymentDate: z.string().min(1),
    paymentMethod: z.enum(['CASH', 'UPI', 'BANK_TRANSFER', 'CHEQUE', 'OTHER']),
    referenceNumber: z.string().optional(),
    notes: z.string().optional(),
  }),
});

router.use(authenticate);

// Analytics & Dashboard
router.get('/dashboard', FinanceController.dashboard);
router.get('/audit-logs', FinanceController.listAuditLogs);
router.get('/calculator', FinanceController.calculateLoan);
router.get('/export/:type', FinanceController.exportData);

// Customers
router.get('/customers', FinanceController.listCustomers);
router.get('/customers/:id', FinanceController.getCustomerDetails);
router.post('/customers', validate(customerSchema), FinanceController.createCustomer);

// Accounts (Loans)
router.get('/accounts', FinanceController.listAccounts);
router.get('/accounts/:id', FinanceController.getAccountDetails);
router.post('/accounts', validate(accountSchema), FinanceController.createAccount);

// Payments & Receipts
router.get('/payments', FinanceController.listPayments);
router.post('/payments', validate(paymentSchema), FinanceController.createPayment);
router.post('/payments/:id/reverse', FinanceController.reversePayment);

export default router;