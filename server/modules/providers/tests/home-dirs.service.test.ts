import assert from 'node:assert/strict';
import test from 'node:test';

import {
  filterDirSuggestions,
  getHomeDirSuggestions,
  splitPrefix,
} from '@/modules/providers/services/home-dirs.service.js';

test('splitPrefix separates listed dir from typed fragment', () => {
  assert.deepEqual(splitPrefix('workspace/ma'), { dirPart: 'workspace', fragment: 'ma' });
  assert.deepEqual(splitPrefix('work'), { dirPart: '', fragment: 'work' });
  assert.deepEqual(splitPrefix('workspace/'), { dirPart: 'workspace', fragment: '' });
});

test('filterDirSuggestions matches fragment, hides dotdirs, sorts, prefixes dirPart', () => {
  const out = filterDirSuggestions({
    dirPart: 'workspace',
    fragment: 'ma',
    entryNames: ['magi-stock', 'patina', 'mars', '.magic'],
  });
  assert.deepEqual(out, ['workspace/magi-stock', 'workspace/mars']);
});

test('filterDirSuggestions shows hidden dirs only when the fragment is dotted', () => {
  const out = filterDirSuggestions({ dirPart: '', fragment: '.c', entryNames: ['.config', '.cache', 'code'] });
  assert.deepEqual(out, ['.cache', '.config']);
});

test('getHomeDirSuggestions rejects traversal and absolute prefixes', async () => {
  assert.deepEqual(await getHomeDirSuggestions('../etc/'), []);
  assert.deepEqual(await getHomeDirSuggestions('/etc/'), []);
  assert.deepEqual(await getHomeDirSuggestions('a/../../etc/'), []);
});
