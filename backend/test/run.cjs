const { spawnSync } = require('node:child_process');
const { mkdtempSync, rmSync } = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { randomBytes } = require('node:crypto');

const backendDir = path.resolve(__dirname, '..');
const tempDir = mkdtempSync(path.join(os.tmpdir(), 'dd-enterprises-test-'));
const env = {
  ...process.env,
  DATABASE_URL: `file:${path.join(tempDir, 'portal-test.db')}`,
  JWT_SECRET: randomBytes(48).toString('base64url'),
  NODE_ENV: 'test',
};

function run(command, args, overrides = {}) {
  const result = spawnSync(command, args, {
    cwd: backendDir,
    env: { ...env, ...overrides },
    stdio: 'inherit',
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    process.exitCode = result.status || 1;
    return false;
  }
  return true;
}

try {
  const migrated = run(path.join(backendDir, 'node_modules/.bin/prisma'), [
    'migrate',
    'deploy',
    '--schema',
    '../prisma/schema.prisma',
  ]);
  const seeded = migrated && run(process.execPath, [path.join(backendDir, 'dist/seed.js')], {
    BOOTSTRAP_ADMIN_USERNAME: 'bootstrap-employer',
    BOOTSTRAP_ADMIN_PASSWORD: 'BootstrapTestPassword!234',
    BOOTSTRAP_ADMIN_NAME: 'Test Employer',
  });
  if (seeded) {
    run(process.execPath, ['--test', path.join(__dirname, 'authorization.test.cjs')]);
  }
} finally {
  rmSync(tempDir, { recursive: true, force: true });
}
