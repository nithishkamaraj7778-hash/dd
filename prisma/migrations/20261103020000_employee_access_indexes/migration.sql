CREATE INDEX "Customer_assignedEmployeeId_idx" ON "Customer"("assignedEmployeeId");
CREATE INDEX "Account_customerId_idx" ON "Account"("customerId");
CREATE INDEX "Payment_createdById_idx" ON "Payment"("createdById");
CREATE INDEX "AuditLog_userId_timestamp_idx" ON "AuditLog"("userId", "timestamp");
