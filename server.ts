const isTsxDev = process.execArgv.some(arg => arg.includes('tsx')) ||
                 process.argv.some(arg => arg.includes('tsx'));

if (!isTsxDev) {
  process.env.NODE_ENV = 'production';
  await import('./dist/server.cjs');
} else {
  await import('./src/server/server.ts');
}
