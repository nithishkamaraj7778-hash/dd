const assert = require('node:assert/strict');
const bcrypt = require('bcryptjs');
const { after, before, test } = require('node:test');
const { createServer } = require('node:http');
const prisma = require('../dist/config/prisma').default;
const app = require('../dist/index').default;

const fixtures = {};
let server;
let baseUrl;

async function createUser(id, username, role) {
  return prisma.user.create({
    data: {
      id,
      username,
      fullName: username,
      role,
      passwordHash: await bcrypt.hash('InitialPassword!234', 4),
      ...(role === 'EMPLOYEE'
        ? {
            employeeProfile: {
              create: { id, employeeId: `EMP-${username.toUpperCase()}` },
            },
          }
        : {}),
    },
  });
}

async function createCustomer(id, customerId, employeeId) {
  return prisma.customer.create({
    data: {
      id,
      customerId,
      fullName: customerId,
      phone: '5551234567',
      address: 'Test address',
      dob: new Date('1990-01-01T00:00:00.000Z'),
      idType: 'Passport',
      idNumber: `TEST-${customerId}`,
      assignedEmployeeId: employeeId,
      createdById: employeeId,
    },
  });
}

async function createAccount(id, accountNumber, customerId) {
  return prisma.account.create({
    data: {
      id,
      accountNumber,
      customerId,
      principalAmount: 1000,
      interestRate: 0,
      interestType: 'SIMPLE',
      startDate: new Date('2025-01-01T00:00:00.000Z'),
      endDate: new Date('2026-01-01T00:00:00.000Z'),
      durationMonths: 12,
      paymentFrequency: 'MONTHLY',
      installmentAmount: 1000 / 12,
      totalPayable: 1000,
      outstandingBalance: 1000,
      createdById: customerId === fixtures.customerA.id ? fixtures.employeeA.id : fixtures.employeeB.id,
    },
  });
}

async function createPayment(id, receiptNumber, account, customer, user) {
  const payment = await prisma.payment.create({
    data: {
      id,
      receiptNumber,
      customerId: customer.id,
      accountId: account.id,
      amount: 50,
      paymentDate: new Date('2025-01-15T00:00:00.000Z'),
      paymentMethod: 'CASH',
      createdById: user.id,
    },
  });
  await prisma.account.update({
    where: { id: account.id },
    data: { amountPaid: 50, outstandingBalance: 950 },
  });
  return payment;
}

async function login(username, password = 'InitialPassword!234') {
  const response = await fetch(`${baseUrl}/api/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ username, password }),
  });
  const body = await response.json();
  assert.equal(response.status, 200);
  return body.data;
}

async function request(path, token, options = {}) {
  return fetch(`${baseUrl}/api${path}`, {
    ...options,
    headers: {
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      ...(options.body ? { 'content-type': 'application/json' } : {}),
      ...options.headers,
    },
  });
}

before(async () => {
  fixtures.employer = await prisma.user.findUnique({ where: { username: 'bootstrap-employer' } });
  fixtures.employeeA = await createUser('employee-a-id', 'employee-a', 'EMPLOYEE');
  fixtures.employeeB = await createUser('employee-b-id', 'employee-b', 'EMPLOYEE');
  fixtures.customerA = await createCustomer('customer-a-id', 'CUSTOMER-A', fixtures.employeeA.id);
  fixtures.customerB = await createCustomer('customer-b-id', 'CUSTOMER-B', fixtures.employeeB.id);
  fixtures.accountA = await createAccount('account-a-id', 'ACCOUNT-A', fixtures.customerA.id);
  fixtures.accountB = await createAccount('account-b-id', 'ACCOUNT-B', fixtures.customerB.id);
  fixtures.paymentA = await createPayment('payment-a-id', 'RECEIPT-A', fixtures.accountA, fixtures.customerA, fixtures.employeeA);
  fixtures.paymentB = await createPayment('payment-b-id', 'RECEIPT-B', fixtures.accountB, fixtures.customerB, fixtures.employeeB);

  server = createServer(app);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
  if (server) await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  await prisma.$disconnect();
});

test('enforces isolated employee access and preserves employer management', async () => {
  const employeeA = await login('employee-a');
  const employeeB = await login('employee-b');
  const employer = await login('bootstrap-employer', 'BootstrapTestPassword!234');
  const authA = employeeA.token;
  const authEmployer = employer.token;

  const customers = await request('/finance/customers', authA);
  assert.deepEqual((await customers.json()).data.map((customer) => customer.id), [fixtures.customerA.id]);
  const dashboardA = await request('/finance/dashboard', authA);
  const dashboardAData = (await dashboardA.json()).data;
  assert.equal(dashboardAData.metrics.customers, 1);
  assert.equal(dashboardAData.metrics.payments, 1);
  assert.equal((await request(`/finance/customers/${fixtures.customerB.id}`, authA)).status, 404);
  assert.equal((await request(`/finance/customers/${fixtures.customerB.id}`, authA, {
    method: 'PATCH',
    body: JSON.stringify({ fullName: 'Unauthorized edit' }),
  })).status, 404);
  assert.equal((await request(`/finance/accounts/${fixtures.accountB.id}`, authA)).status, 404);
  assert.equal((await request(`/finance/customers/${fixtures.customerA.id}`, employeeB.token)).status, 404);
  assert.equal((await request(`/finance/accounts/${fixtures.accountA.id}`, employeeB.token)).status, 404);

  const payments = await request('/finance/payments', authA);
  assert.deepEqual((await payments.json()).data.map((payment) => payment.id), [fixtures.paymentA.id]);
  assert.equal((await request(`/finance/payments/${fixtures.paymentB.id}/reverse`, authA, {
    method: 'POST',
    body: JSON.stringify({ reason: 'Unauthorized attempt' }),
  })).status, 404);
  const otherAccountPayment = await request('/finance/payments', authA, {
    method: 'POST',
    body: JSON.stringify({
      accountId: fixtures.accountB.id,
      amount: 10,
      paymentDate: '2025-01-02T00:00:00.000Z',
      paymentMethod: 'CASH',
    }),
  });
  assert.equal(otherAccountPayment.status, 404);

  assert.equal((await request('/employees', authA)).status, 403);
  assert.equal((await request('/finance/customers', authA, {
    method: 'POST',
    body: JSON.stringify({
      fullName: 'Assigned employee',
      phone: '5557654321',
      address: 'Employee address',
      dob: '1990-01-01',
      idType: 'Passport',
      idNumber: 'EMP-TEST',
      assignedEmployeeId: fixtures.employeeB.id,
    }),
  })).status, 400);
  const ownCustomerResponse = await request('/finance/customers', authA, {
    method: 'POST',
    body: JSON.stringify({
      fullName: 'Employee A customer',
      phone: '5557654321',
      address: 'Employee address',
      dob: '1990-01-01',
      idType: 'Passport',
      idNumber: 'EMP-TEST',
    }),
  });
  assert.equal(ownCustomerResponse.status, 201);
  assert.equal((await ownCustomerResponse.json()).data.assignedEmployeeId, fixtures.employeeA.id);
  const ownLoan = {
    principalAmount: 500,
    interestRate: 0,
    interestType: 'SIMPLE',
    durationMonths: 12,
    paymentFrequency: 'MONTHLY',
    startDate: '2025-01-01',
  };
  assert.equal((await request('/finance/accounts', authA, {
    method: 'POST',
    body: JSON.stringify({ ...ownLoan, customerId: fixtures.customerA.id }),
  })).status, 201);
  assert.equal((await request('/finance/accounts', authA, {
    method: 'POST',
    body: JSON.stringify({ ...ownLoan, customerId: fixtures.customerB.id }),
  })).status, 404);
  assert.equal((await request('/auth/me', authA, {
    method: 'PATCH',
    body: JSON.stringify({ role: 'SUPERADMIN' }),
  })).status, 400);

  const filteredLogs = await request(`/finance/audit-logs?employeeId=${fixtures.employeeB.id}`, authA);
  assert.ok((await filteredLogs.json()).data.every((log) => log.userId === fixtures.employeeA.id));

  const allCustomers = await request('/finance/customers', authEmployer);
  assert.equal((await allCustomers.json()).data.length, 3);
  const dashboardEmployer = await request('/finance/dashboard', authEmployer);
  assert.equal((await dashboardEmployer.json()).data.metrics.customers, 3);
  assert.equal((await request('/employees', authEmployer)).status, 200);

  const createdEmployeeResponse = await request('/employees', authEmployer, {
    method: 'POST',
    body: JSON.stringify({ username: 'new-employee', fullName: 'New Employee' }),
  });
  assert.equal(createdEmployeeResponse.status, 201);
  const createdEmployee = (await createdEmployeeResponse.json()).data;
  assert.equal((await prisma.user.findUnique({ where: { id: createdEmployee.employee.user.id } })).role, 'EMPLOYEE');
  assert.equal(createdEmployee.employee.user.isActive, true);
  const temporaryLoginResponse = await fetch(`${baseUrl}/api/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      username: 'new-employee',
      password: createdEmployee.temporaryPassword,
    }),
  });
  assert.equal(temporaryLoginResponse.status, 200);
  const temporarySession = (await temporaryLoginResponse.json()).data;
  assert.equal(temporarySession.user.mustChangePassword, true);
  assert.equal((await request('/finance/customers', temporarySession.token)).status, 403);

  const reset = await request(`/employees/${fixtures.employeeA.id}/reset-password`, authEmployer, { method: 'POST' });
  assert.equal(reset.status, 200);
  const resetPassword = (await reset.json()).data.temporaryPassword;
  const resetLogin = await fetch(`${baseUrl}/api/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ username: 'employee-a', password: resetPassword }),
  });
  assert.equal(resetLogin.status, 200);
  const temporaryResetSession = (await resetLogin.json()).data;
  assert.equal((await request('/finance/customers', temporaryResetSession.token)).status, 403);
  const changePasswordResponse = await request('/auth/change-password', temporaryResetSession.token, {
    method: 'POST',
    body: JSON.stringify({
      currentPassword: resetPassword,
      newPassword: 'ChangedPassword!234',
    }),
  });
  assert.equal(changePasswordResponse.status, 200);
  const resetSession = (await changePasswordResponse.json()).data;

  const newPayment = await request('/finance/payments', resetSession.token, {
    method: 'POST',
    body: JSON.stringify({
      accountId: fixtures.accountA.id,
      amount: 100,
      paymentDate: '2025-02-01T00:00:00.000Z',
      paymentMethod: 'CASH',
    }),
  });
  assert.equal(newPayment.status, 201);
  const paymentData = (await newPayment.json()).data;
  assert.ok(paymentData.receiptNumber);
  assert.ok(paymentData.receipt);

  const employerAccess = await request(`/finance/customers/${fixtures.customerB.id}`, authEmployer);
  assert.equal(employerAccess.status, 200);

  const deactivation = await request(`/employees/${fixtures.employeeA.id}/status`, authEmployer, {
    method: 'PATCH',
    body: JSON.stringify({ isActive: false }),
  });
  assert.equal(deactivation.status, 200);
  assert.equal((await request('/auth/me', resetSession.token)).status, 401);
  const inactiveLogin = await fetch(`${baseUrl}/api/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ username: 'employee-a', password: 'ChangedPassword!234' }),
  });
  assert.equal(inactiveLogin.status, 401);

  assert.ok(employeeB.token);
});
