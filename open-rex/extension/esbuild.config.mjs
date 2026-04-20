import esbuild from 'esbuild';

const watch = process.argv.includes('--watch');
const prod = !watch;

const common = {
  bundle: true,
  sourcemap: !prod,
  minify: prod,
  target: 'es2020',
  logLevel: 'info',
};

const builds = [
  {
    ...common,
    entryPoints: ['src/background/service-worker.ts'],
    outfile: 'dist/service-worker.js',
    format: 'esm',
  },
  {
    ...common,
    entryPoints: ['src/content/content-script.ts'],
    outfile: 'dist/content-script.js',
    format: 'iife',
  },
];

if (watch) {
  for (const b of builds) {
    const ctx = await esbuild.context(b);
    await ctx.watch();
  }
  console.log('watching...');
} else {
  await Promise.all(builds.map((b) => esbuild.build(b)));
  console.log('build complete');
}
