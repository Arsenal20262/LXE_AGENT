// macOS bundle extraction follows DeepSeek Harness; see LICENSE in this directory.
import { mkdtemp, readFile, readdir, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { run } from './process';

/** Read the bundle's own icon; getFileIcon(.app) can return a generic macOS icon. */
export async function bundleIconDataUrl(bundle: string, execute = run): Promise<string> {
  const resources = join(bundle, 'Contents', 'Resources');
  const metadata: unknown = JSON.parse(await execute('/usr/bin/plutil', [
    '-convert', 'json', '-o', '-', join(bundle, 'Contents', 'Info.plist'),
  ], 4000));
  const declared = metadata && typeof metadata === 'object' ? Reflect.get(metadata, 'CFBundleIconFile') : undefined;
  const iconFile = typeof declared === 'string' && declared.length > 0
    ? declared + (declared.toLowerCase().endsWith('.icns') ? '' : '.icns')
    : (await readdir(resources)).sort().find(name => name.toLowerCase().endsWith('.icns'));
  if (!iconFile) throw new Error(`No .icns application icon found in ${resources}`);
  const source = join(resources, iconFile);
  if (!(await stat(source)).isFile()) throw new Error(`Application icon is not a file: ${source}`);

  const temporary = await mkdtemp(join(tmpdir(), 'lxe-workspace-icon-'));
  try {
    const output = join(temporary, 'icon.png');
    await execute('/usr/bin/sips', ['-s', 'format', 'png', '-Z', '128', source, '--out', output], 4000);
    const bytes = await readFile(output);
    if (!bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) {
      throw new Error(`Icon conversion did not produce a PNG: ${source}`);
    }
    return `data:image/png;base64,${bytes.toString('base64')}`;
  } finally {
    await rm(temporary, { recursive: true, force: true });
  }
}
