const fs = require('fs');
const path = require('path');

const targetDir = path.join(process.cwd(), 'node_modules', '.prisma', 'client');
const targetFile = path.join(targetDir, 'default.js');

if (fs.existsSync(targetFile)) {
  console.log('[prisma-shim] Generated Prisma client found, no shim needed.');
  process.exit(0);
}

fs.mkdirSync(targetDir, { recursive: true });

const shim = `class PrismaClient {
  constructor() {
    const asyncMethod = async () => {
      throw new Error('Prisma Client is not generated in this environment. Run "prisma generate" where Prisma engines are available.');
    };

    const modelProxy = new Proxy(
      {},
      {
        get(_target, prop) {
          if (prop === 'then') return undefined;
          return asyncMethod;
        }
      }
    );

    return new Proxy(this, {
      get(target, prop) {
        if (prop in target) return target[prop];
        if (prop === '$disconnect' || prop === '$connect' || prop === '$transaction') {
          return asyncMethod;
        }
        return modelProxy;
      }
    });
  }
}

module.exports = {
  PrismaClient,
  Prisma: {}
};
`;

fs.writeFileSync(targetFile, shim);
console.log('[prisma-shim] Wrote fallback Prisma client shim at', targetFile);
