import dotenv from 'dotenv';
import path from 'path';
import bcrypt from 'bcryptjs';
import { PrismaClient } from '@prisma/client';

dotenv.config({ path: path.resolve(process.cwd(), '../.env') });

async function seedEmployer() {
  const username = process.env.BOOTSTRAP_ADMIN_USERNAME?.trim();
  const password = process.env.BOOTSTRAP_ADMIN_PASSWORD;
  const fullName = process.env.BOOTSTRAP_ADMIN_NAME?.trim() || 'DD Enterprises Employer';

  if (!username || !password || password.length < 14) {
    throw new Error('Set BOOTSTRAP_ADMIN_USERNAME and a BOOTSTRAP_ADMIN_PASSWORD of at least 14 characters.');
  }

  const prisma = new PrismaClient();
  try {
    if (await prisma.user.count() > 0) {
      throw new Error('Bootstrap refused: the database already contains users.');
    }

    await prisma.user.create({
      data: {
        username,
        fullName,
        passwordHash: await bcrypt.hash(password, 12),
        role: 'SUPERADMIN',
      },
    });
    console.log(`Created employer account "${username}".`);
  } finally {
    await prisma.$disconnect();
  }
}

seedEmployer().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
