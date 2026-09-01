// Runs the REAL conversion-hook source under Node, with only its two external
// edges swapped for stubs: the supabase-js import and Deno.serve/Deno.env.
// Nothing in the function's own logic is modified.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

const HERE = new URL('.', import.meta.url).pathname;
const SP = HERE + '.hookrun';
const src = readFileSync(new URL('../../supabase/functions/conversion-hook/index.ts', import.meta.url), 'utf8');

let patched = src
  .replace('import { createClient } from "https://esm.sh/@supabase/supabase-js@2";',
           `import { createClient } from ${JSON.stringify(new URL('./stub_supabase.mjs', import.meta.url).href)};`)
  .replace('} from "../_shared/public_form_security.mjs";',
           `} from ${JSON.stringify(new URL('../../supabase/functions/_shared/public_form_security.mjs', import.meta.url).href)};`)
  .replace('Deno.serve(async (req: Request): Promise<Response> => {',
           'export const handler = (async (req: Request): Promise<Response> => {')
  .replace(/\}\);\s*$/, '});\n');
// Deno.env -> process.env shim, declared before use.
patched = 'const Deno = { env: { get: (k: string) => process.env[k] ?? "" } };\n' + patched;

mkdirSync(SP, { recursive: true });
writeFileSync(SP + '/hook.ts', patched);

process.env.SUPABASE_URL = 'http://stub';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'stub-key';

export const { handler } = await import(pathToFileURL(SP + '/hook.ts').href);
export const { store, reset } = await import('./stub_supabase.mjs');

export function multipart(fields, file) {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) fd.append(k, String(v));
  if (file) fd.append('screenshot', new File([file.bytes], file.name, { type: file.type }));
  return new Request('http://stub/conversion-hook', { method: 'POST', body: fd });
}
