// jest-resolver.cjs — project-scoped .js → .ts remap for ESM tests.
//
// TypeScript with `module: NodeNext` requires every relative import to carry the
// `.js` extension in source, while the package still ships the source as `.ts`
// until tsc emits `dist/`. Jest's default resolver looks for the literal `.js`
// file under the project root and fails. This resolver intercepts that request
// and, if a sibling `.ts` (or `.tsx`/`.mts`/`.cts`) file exists in `src/` or
// `test/`, returns that path instead.
//
// Imports that resolve outside the project (node_modules, etc.) are passed
// through untouched so internal `require('./cjs/...')` calls in dependencies
// are not remapped.

const path = require('node:path');
const fs = require('node:fs');

const PROJECT_ROOT = path.resolve(__dirname, '..');
const PROJECT_SCOPES = [
  path.join(PROJECT_ROOT, 'src'),
  path.join(PROJECT_ROOT, 'test'),
];

const SOURCE_EXTENSIONS = ['.ts', '.tsx', '.mts', '.cts', '.js', '.mjs', '.cjs'];

module.exports = function resolver(request, options) {
  if (
    request &&
    (request.startsWith('./') || request.startsWith('../')) &&
    (request.endsWith('.js') || request.endsWith('.mjs') || request.endsWith('.cjs'))
  ) {
    const basedir = (options && options.basedir) || PROJECT_ROOT;
    const absoluteBase = path.isAbsolute(basedir) ? basedir : path.resolve(PROJECT_ROOT, basedir);
    const requestedPath = path.resolve(absoluteBase, request);
    const withinProject = PROJECT_SCOPES.some(
      (scope) => requestedPath.startsWith(scope + path.sep) || requestedPath === scope,
    );

    if (withinProject) {
      const dotExt = path.extname(request);
      const stem = request.slice(0, -dotExt.length);
      for (const ext of SOURCE_EXTENSIONS) {
        const candidate = path.resolve(absoluteBase, stem + ext);
        if (fs.existsSync(candidate)) {
          return candidate;
        }
      }
    }
  }
  return options.defaultResolver(request, options);
};
