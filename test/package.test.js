import assert from 'node:assert/strict'
import {execFileSync} from 'node:child_process'
import {mkdtemp, readFile, rm} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import test from 'node:test'

test('ships notices and every declared entrypoint without install-time scripts', async (t) => {
  const directory = await mkdtemp(join(tmpdir(), 'ardent-cli-package-'))
  t.after(() => rm(directory, {recursive: true, force: true}))
  // npm test has already built and generated the manifest. Packing must not
  // rebuild dist while other test files are importing it.
  const [packed] = JSON.parse(execFileSync('npm', [
    'pack', '--json', '--ignore-scripts', '--pack-destination', directory,
  ], {encoding: 'utf8'}))
  const archive = join(directory, packed.filename)
  const contents = execFileSync('tar', ['-tzf', archive], {encoding: 'utf8'}).trim().split('\n')
  const paths = new Set(contents)
  const readPacked = (path) => execFileSync('tar', ['-xOzf', archive, `package/${path}`], {encoding: 'utf8'})
  const assertPacked = (path) => assert.ok(paths.has(`package/${path.replace(/^\.\//, '')}`), `${path} missing from tarball`)

  for (const file of ['LICENSE', 'NOTICE', 'openapi.json']) {
    assertPacked(file)
    const original = await readFile(file, 'utf8')
    assert.ok(original.trim(), `${file} is empty`)
    assert.equal(readPacked(file), original)
  }

  const specification = JSON.parse(readPacked('openapi.json'))
  assert.equal(specification.openapi, '3.1.1')

  const metadata = JSON.parse(readPacked('package.json'))
  for (const hook of ['preinstall', 'install', 'postinstall', 'prepare']) {
    assert.equal(metadata.scripts?.[hook], undefined, `${hook} must not run during installation`)
  }
  assertPacked(metadata.main)
  assertPacked(metadata.types)
  for (const executable of Object.values(metadata.bin)) {
    assertPacked(executable)
    const path = executable.replace(/^\.\//, '')
    assert.match(readPacked(path), /^#!\/usr\/bin\/env node\r?\n/)
    assert.ok(packed.files.find((file) => file.path === path).mode & 0o111, `${path} is not executable`)
  }

  assertPacked('oclif.manifest.json')
  const manifest = JSON.parse(readPacked('oclif.manifest.json'))
  assert.equal(manifest.version, metadata.version)
  assert.ok(Object.keys(manifest.commands).length > 0, 'command manifest is empty')
  for (const command of Object.values(manifest.commands)) {
    assertPacked(command.relativePath.join('/'))
  }
})
