import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { INSTALL_DIR_NAME, resolvePaths } from './install-plan.mjs';

const ENV = {
  LOCALAPPDATA: path.join('C:', 'Users', 'tester', 'AppData', 'Local'),
  APPDATA: path.join('C:', 'Users', 'tester', 'AppData', 'Roaming')
};

test('resolvePaths 把副本装在 LOCALAPPDATA 下的独立目录', () => {
  const paths = resolvePaths(ENV);
  assert.equal(paths.installRoot, path.join(ENV.LOCALAPPDATA, INSTALL_DIR_NAME));
  assert.equal(paths.packageRoot, path.join(paths.installRoot, 'package'));
  assert.equal(paths.profileRoot, path.join(paths.installRoot, 'profile'));
  assert.equal(paths.revertRoot, path.join(paths.installRoot, 'revert'));
});

test('appRoot 必须落在 packageRoot 之内', () => {
  const { appRoot, packageRoot } = resolvePaths(ENV);
  assert.equal(appRoot, path.join(packageRoot, 'app'));
  const relative = path.relative(packageRoot, appRoot);
  assert.equal(relative, 'app');
  assert.equal(relative.startsWith('..'), false, 'appRoot 不能落在副本之外');
});

test('补丁产物的路径都以 packageRoot 为根', () => {
  const { appRoot, packageRoot } = resolvePaths(ENV);
  for (const suffix of [
    path.join('resources', 'ion-dist', 'i18n', 'en-US.json'),
    path.join('resources', 'ion-dist', 'index.html'),
    path.join('resources', 'ion-dist', 'assets', 'v1')
  ]) {
    assert.equal(path.relative(packageRoot, path.join(appRoot, suffix)), path.join('app', suffix));
  }
});

test('locale 写在副本自己的 userData 里，不碰官方共享配置', () => {
  const paths = resolvePaths(ENV);
  assert.equal(paths.userDataRoot, path.join(paths.profileRoot, 'Claude'));
  assert.equal(paths.configPath, path.join(paths.userDataRoot, 'config.json'));
  assert.equal(path.relative(paths.installRoot, paths.configPath).startsWith('..'), false,
    'configPath 必须落在副本目录内，否则就是在改官方数据');
});

test('locale 旧值 sidecar 与补丁备份同在 revert 目录', () => {
  const paths = resolvePaths(ENV);
  assert.equal(path.dirname(paths.localeSidecarPath), paths.revertRoot);
});

test('resolvePaths 不做任何写入', () => {
  const paths = resolvePaths(ENV);
  assert.equal(existsSync(paths.installRoot), false);
});

test('不读 APPDATA，缺了也能算出全部路径', () => {
  const paths = resolvePaths({ LOCALAPPDATA: ENV.LOCALAPPDATA });
  assert.equal(paths.installRoot, path.join(ENV.LOCALAPPDATA, INSTALL_DIR_NAME));
});

test('缺少 LOCALAPPDATA 时报错', () => {
  assert.throws(() => resolvePaths({}), /LOCALAPPDATA/);
  assert.throws(() => resolvePaths({ LOCALAPPDATA: 'relative\\dir' }), /LOCALAPPDATA/);
});
