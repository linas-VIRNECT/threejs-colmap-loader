const { execSync } = require('child_process');
require('esbuild').build({
    entryPoints: ['src/index.ts'],
    bundle: true,
    outfile: 'dist/index.js',
    platform: 'browser',
    minify: false,
    format: "esm",
    sourcemap: true,
    external: ['three']  // Exclude three.js
}).catch((err) => {console.log("Failed building the package:", err); process.exit(1)});

execSync('tsc', { stdio: 'inherit' });