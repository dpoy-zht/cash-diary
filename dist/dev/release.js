#!/usr/bin/env node
/**
 * 一条命令发版：打 wgt → 生成元数据 → 推服务器 →（可选）发 GitHub Release。
 *
 * 为什么有这个（2026-10-07）：
 * 原来的流程要手动敲 4~5 条命令，中间任何一步漏了就得回头查。
 * 而云打包要 5 分钟且晚间队列拥堵（实测当晚连续失败 5 次），
 * 所以**能把 wgt 分发出去的路（服务器）必须尽可能短**——
 * 云打包是唯一躲不掉的慢环节，不该再往它前后塞手工步骤。
 *
 * 用法：
 *   node dist/dev/release.js v2.3.10            # 测试+构建 + wgt + 推服务器
 *   node dist/dev/release.js v2.3.10 --github  # 顺便发 GitHub Release
 *   node dist/dev/release.js v2.3.10 --skip-build   # 产物已是最新，跳过测试构建
 *
 * 环境变量：
 *   CD_SSH_PASSWORD  服务器密码（必填，不落盘不进 git）
 */
const fs = require('fs')
const path = require('path')
const { execFileSync } = require('child_process')
const { Client } = require('ssh2')

const ROOT = path.resolve(__dirname, '..', '..')
const RELEASE = path.join(ROOT, 'dist', 'release')
const PY = 'C:/Users/zhtzh/.workbuddy/binaries/python/versions/3.13.12/python.exe'
const HOST = process.env.CD_SSH_HOST || '121.40.24.123'
const USER = process.env.CD_SSH_USER || 'root'
const PASS = process.env.CD_SSH_PASSWORD || ''
const WEB_DIR = '/var/www/cash-diary/update'

const tag = process.argv[2]
if (!tag || !/^v\d+\.\d+\.\d+$/.test(tag)) {
  console.error('用法: node dist/dev/release.js <tag> [--github] [--skip-build]')
  process.exit(1)
}
const wantGithub = process.argv.includes('--github')
const skipBuild = process.argv.includes('--skip-build')

function step(n, total, title) {
  console.log('\n[' + n + '/' + total + '] ' + title)
}

function sh(cmd, args) {
  return execFileSync(cmd, args, { cwd: ROOT, encoding: 'utf8' })
}

function conn() {
  return new Promise((resolve, reject) => {
    const c = new Client()
    c.on('ready', () => resolve(c))
    c.on('error', reject)
    c.connect({ host: HOST, port: 22, username: USER, password: PASS, readyTimeout: 20000 })
  })
}

function shRemote(c, cmd) {
  return new Promise((resolve, reject) => {
    c.exec(cmd, (err, stream) => {
      if (err) return reject(err)
      let out = ''
      stream.on('data', (d) => { out += d.toString() })
      stream.stderr.on('data', (d) => { out += d.toString() })
      stream.on('close', (code) => resolve({ out: out.trim(), code }))
    })
  })
}

/** base64 分块写盘（云主机 SFTP 受限，只能走 exec；分块 ≤48KB 见 server-ssh.js 注释） */
function put(c, local, remote) {
  return new Promise((resolve, reject) => {
    const data = fs.readFileSync(local)
    const CHUNK = 48 * 1024
    let i = 0
    const next = () => {
      if (i * CHUNK >= data.length) return resolve()
      const b64 = data.slice(i * CHUNK, (i + 1) * CHUNK).toString('base64')
      const redir = i === 0 ? '>' : '>>'
      shRemote(c, 'echo -n "' + b64 + '" | base64 -d ' + redir + ' ' + remote)
        .then((r) => {
          if (r.code !== 0) return reject(new Error('第 ' + (i + 1) + ' 块失败: ' + r.out))
          i++; next()
        }, reject)
    }
    next()
  })
}

;(async function () {
  const TOTAL = wantGithub ? 5 : 4
  console.log('发布 %s（%d步）', tag, TOTAL)

  step(1, TOTAL, '测试 + 构建')
  if (skipBuild) {
    console.log('  跳过（--skip-build）')
  } else {
    console.log('  npm test ...')
    const t = sh('C:/Users/zhtzh/.workbuddy/binaries/node/versions/22.22.2-6/node.exe', ['-e',
      'process.exit(require("child_process").spawnSync("npm.cmd",["test"],{stdio:"inherit"}).status)'])
    console.log('  测试通过')
    console.log('  npm run build:app ...')
    sh('C:/Users/zhtzh/.workbuddy/binaries/node/versions/22.22.2-6/node.exe',
      ['-e', 'process.exit(require("child_process").spawnSync("npm.cmd",["run","build:app"],{stdio:"inherit"}).status)'])
    console.log('  构建完成')
  }

  step(2, TOTAL, '打 wgt')
  // 用上一版 wgt 作结构模板（沿用 gen-wgt.py 的约定）
  const prevTag = 'v2.3.10'
  const tmpl = path.join(RELEASE, 'nailong-ledger-' + prevTag + '.wgt')
  const out = path.join(RELEASE, 'nailong-ledger-' + tag + '.wgt')
  sh(PY, [path.join('dist', 'dev', 'gen-wgt.py'), tmpl, path.join('dist', 'build', 'app'), out])
  console.log('  ' + out.replace(ROOT + '\\', '') + '（' +
    (fs.statSync(out).size).toLocaleString() + ' B）')

  step(3, TOTAL, '生成 latest.json')
  const jsonPath = path.join(RELEASE, 'latest.json')
  const args = [path.join('dist', 'dev', 'gen-latest-json.py'), '--tag', tag, '--wgt', out]
  if (fs.existsSync(path.join(RELEASE, 'nailong-ledger-' + tag + '.apk'))) {
    args.push('--apk', path.join(RELEASE, 'nailong-ledger-' + tag + '.apk'))
  }
  sh(PY, args)
  console.log('  ' + jsonPath.replace(ROOT + '\\', ''))

  step(4, TOTAL, '推送到服务器')
  if (!PASS) {
    console.error('  ✗ 未设置 CD_SSH_PASSWORD，跳过推送')
    console.error('    服务器上的 latest.json 还是旧版本，手机会拿到旧的 wgt。')
    process.exit(2)
  }
  let c
  try {
    c = await conn()
    await shRemote(c, 'mkdir -p ' + WEB_DIR)
    const files = [['latest.json', '/latest.json'], ['nailong-ledger-' + tag + '.wgt', '/nailong-ledger-' + tag + '.wgt']]
    for (const [name, dest] of files) {
      await put(c, path.join(RELEASE, name), WEB_DIR + dest)
      const localSize = fs.statSync(path.join(RELEASE, name)).size
      const remoteSize = (await shRemote(c, 'stat -c %s ' + WEB_DIR + dest)).out
      const ok = String(localSize) === String(remoteSize)
      console.log('  ' + (ok ? '✓' : '✗') + ' ' + name + '  ' +
        localSize.toLocaleString() + ' B → 远端 ' + remoteSize)
      if (!ok) throw new Error(name + ' 大小不一致')
    }
    const chk = await shRemote(c, 'curl -s --max-time 8 -o /dev/null -w "%{http_code}" http://127.0.0.1/update/latest.json')
    console.log('  本机 curl 校验 → HTTP ' + chk.out)
  } finally {
    if (c) c.end()
  }

  if (wantGithub) {
    step(5, TOTAL, '发 GitHub Release（兜底源）')
    const hasApk = fs.existsSync(path.join(RELEASE, 'nailong-ledger-' + tag + '.apk'))
    const a = ['dist/dev/publish-release.py', tag, '--apply']
    if (!hasApk) a.push('--wgt-only')
    console.log(sh(PY, a).trim().split('\n').slice(-4).join('\n'))
  } else {
    console.log('\n（加 --github 可同时发 GitHub Release，作为服务器挂了时的兜底源）')
  }

  console.log('\n完成 ✅  以后热更走服务器，点「检查更新」即可')
  console.log('提醒：改了 App 本身（权限/manifest/新依赖）仍需云打包 APK，')
  console.log('      服务器方案只解决 wgt 分发，不能替代云打包。')
})().catch(function (e) {
  console.error('\n失败：' + e.message)
  process.exit(1)
})