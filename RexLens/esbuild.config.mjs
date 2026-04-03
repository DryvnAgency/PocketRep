import { build, context } from 'esbuild';

const isWatch = process.argv.includes('--watch');

const sharedConfig = {
  bundle: true,
  sourcemap: true,
  target: 'es2020',
  format: 'esm',
  minify: !isWatch,
};

const entryPoints = [
  {
    entryPoints: ['src/background/service-worker.ts'],
    outfile: 'dist/service-worker.js',
  },
  {
    entryPoints: ['src/content/content-script.ts'],
    outfile: 'dist/content-script.js',
    format: 'iife', // Content scripts need IIFE
  },
  {
    entryPoints: ['src/sidepanel/sidepanel.ts'],
    outfile: 'dist/sidepanel.js',
  },
];

async function run() {
  for (const entry of entryPoints) {
    const config = {
      ...sharedConfig,
      ...entry,
      format: entry.format || sharedConfig.format,
    };

    if (isWatch) {
      const ctx = await context(config);
      await ctx.watch();
      console.log(`Watching ${entry.entryPoints[0]}...`);
    } else {
      await build(config);
      console.log(`Built ${entry.outfile}`);
    }
  }
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
