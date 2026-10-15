/* node --import hook for the tsx QA scripts that import screen modules: a stylesheet import becomes an empty module. */
import { register } from 'node:module';
register('data:text/javascript,' + encodeURIComponent(`
export async function load(url, ctx, next) {
  if (/\\.css(\\?.*)?$/.test(url)) return { format: 'module', source: '', shortCircuit: true };
  return next(url, ctx);
}`));
