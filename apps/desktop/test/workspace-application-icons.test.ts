import { afterEach, expect, test } from 'bun:test';
import { existsSync } from 'node:fs';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { bundleIconDataUrl } from '../src/main/workspace-apps/icons';
const roots: string[] = [];
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jP1sAAAAASUVORK5CYII=', 'base64');
async function bundle() {
  const root = await mkdtemp(join(tmpdir(), 'lxe-bundle-icon-test-')); roots.push(root);
  const path = join(root, '应用 & space.app');
  await mkdir(join(path, 'Contents', 'Resources'), { recursive: true });
  return path;
}
afterEach(async () => { await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true }))); });

test('bundle icons use the declared resource with literal paths and clean converted output', async () => {
  const path = await bundle();
  await writeFile(join(path, 'Contents', 'Resources', '图标.icns'), 'fixture');
  for (const declared of ['图标', '图标.icns']) {
    let output = '';
    const icon = await bundleIconDataUrl(path, async (command, args) => {
      if (command === '/usr/bin/plutil') {
        expect(args).toEqual(['-convert', 'json', '-o', '-', join(path, 'Contents', 'Info.plist')]);
        return JSON.stringify({ CFBundleIconFile: declared });
      }
      expect(command).toBe('/usr/bin/sips');
      expect(args.slice(0, 6)).toEqual(['-s', 'format', 'png', '-Z', '128', join(path, 'Contents', 'Resources', '图标.icns')]);
      output = args.at(-1)!; await writeFile(output, png); return '';
    });
    expect(icon).toBe(`data:image/png;base64,${png.toString('base64')}`);
    expect(existsSync(dirname(output))).toBe(false);
  }
});

test('bundles without a declared icon use a Resources icns and preserve missing-resource errors', async () => {
  const path = await bundle();
  await writeFile(join(path, 'Contents', 'Resources', 'fallback.icns'), 'fixture');
  await bundleIconDataUrl(path, async (command, args) => {
    if (command === '/usr/bin/plutil') return '{}';
    expect(args[5]).toBe(join(path, 'Contents', 'Resources', 'fallback.icns'));
    await writeFile(args.at(-1)!, png); return '';
  });
  await expect(bundleIconDataUrl(path, async () => '{"CFBundleIconFile":"missing"}')).rejects.toThrow('ENOENT');
});

test('plist and conversion failures keep actual diagnostics; failed conversions leave no temporary directory', async () => {
  const path = await bundle();
  await writeFile(join(path, 'Contents', 'Resources', 'broken.icns'), 'fixture');
  await expect(bundleIconDataUrl(path, async () => { throw new Error('plutil: Unexpected character at line 1'); })).rejects.toThrow('plutil: Unexpected character at line 1');
  let output = '';
  await expect(bundleIconDataUrl(path, async (command, args) => {
    if (command === '/usr/bin/plutil') return '{"CFBundleIconFile":"broken"}';
    output = args.at(-1)!; throw new Error('sips: Cannot extract image from file');
  })).rejects.toThrow('sips: Cannot extract image from file');
  expect(existsSync(dirname(output))).toBe(false);
  await expect(bundleIconDataUrl(path, async (command, args) => {
    if (command === '/usr/bin/plutil') return '{"CFBundleIconFile":"broken"}';
    output = args.at(-1)!; await writeFile(output, 'not a png'); return '';
  })).rejects.toThrow('Icon conversion did not produce a PNG');
  expect(existsSync(dirname(output))).toBe(false);
});
