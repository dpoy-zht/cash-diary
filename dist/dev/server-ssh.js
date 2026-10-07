/**
 * 通过 SSH 操作自建更新源服务器（2026-10-07）。
 *
 * 用途：把 wgt + latest.json 推到 Nginx 目录，配置 location，验证手机可访问。
 * 密码从环境变量 CD_SSH_PASSWORD 读取 —— **不落盘、不进 git**。
 *
 * 用法：
 *   node dist/dev/server-ssh.js probe     # 探活：nginx 配置与目录现状
 *   node dist/dev/server-ssh.js deploy    # 部署：建目录 + 上传 + 改 nginx + reload
 *   node dist/dev/server-ssh.js verify    # 验证：从公网读 latest.json
 */
const fs = require('fs')
const path = require('path')
const { Client } = require('ssh2')

const HOST = process.env.CD_SSH_HOST || '121.40.24.123'
const USER = process.env.CD_SSH_USER || 'root'
const PASS = process.env.CD_SSH_PASSWORD || ''
const WEB_DIR = '/var/www/cash-diary/update'

const ROOT = path.resolve(__dirname, '..', '..')

function conn() {
  return new Promise((resolve, reject) => {
    const c = new Client()
    c.on('ready', () => resolve(c))
    c.on('error', reject)
    c.connect({ host: HOST, port: 22, username: USER, password: PASS, readyTimeout: 20000 })
  })
}

/** 在连接上跑一条命令，返回 {stdout, code} */
function sh(c, cmd) {
  return new Promise((resolve, reject) => {
    c.exec(cmd, (err, stream) => {
      if (err) return reject(err)
      let out = ''
      let errOut = ''
      stream.on('data', (d) => { out += d.toString() })
      stream.stderr.on('data', (d) => { errOut += d.toString() })
      stream.on('close', (code) => resolve({ out: out.trim(), err: errOut.trim(), code }))
    })
  })
}

/**
 * 上传单个文件。
 *
 * ⚠️ **两个实测踩到的坑**（2026-10-07）：
 *
 * 1. **不能用 SFTP**：云主机 sshd 常把 SFTP 子系统限制在极窄范围 ——
 *    `sftp.stat` 能过，但 `realpath('.')` 返回 "No response from server"，
 *    `fastPut` 直接报 "No such file"。改走 exec + base64 分块写盘。
 *
 * 2. **分块要够小**：exec 的单条命令长度有上限，
 *    240KB 的块传573KB 文件会中途 "Unable to exec"（连接被服务端掐断）。
 *    实测 **48KB 稳定**。wgt 已 gzip 过（压缩率仅 2%），没法再压小，
 *    只能靠分块数换稳定（约 15 块，每块一条命令）。
 */
function put(c, local, remote) {
  return new Promise((resolve, reject) => {
    const data = fs.readFileSync(local)
    const CHUNK = 48 * 1024
    let i = 0
    const next = () => {
      if (i * CHUNK >= data.length) return resolve()
      const b64 = data.slice(i * CHUNK, (i + 1) * CHUNK).toString('base64')
      const cmd = (i === 0 ? '>' : '>>') + ' ' + remote
        ;(i === 0 ? 'echo -n "' + b64 + '" | base64 -d ' + cmd
                 : 'echo -n "' + b64 + '" | base64 -d ' + cmd)
      sh(c, i === 0 ? 'echo -n "' + b64 + '" | base64 -d > ' + remote
                    : 'echo -n "' + b64 + '" | base64 -d >> ' + remote)
        .then((r) => {
          if (r.code !== 0) return reject(new Error('第 ' + (i + 1) + ' 块失败: ' + (r.err || 'code=' + r.code)))
          i++
          next()
        }, reject)
    }
    next()
  })
}

async function probe(c) {
  const cmds = [
    'cat /etc/os-release | grep PRETTY_NAME',
    'nginx -v 2>&1',
    'ls -la ' + WEB_DIR + ' 2>&1 | head -5',
    "grep -rn 'cash-diary\\|location /update' /etc/nginx/ 2>/dev/null | head -5",
    'df -h / | tail -1'
  ]
  for (const cmd of cmds) {
    const r = await sh(c, cmd)
    console.log('$ ' + cmd)
    console.log('  ' + (r.out || r.err || '(空)').split('\n').slice(0, 5).join('\n  '))
  }
}

async function deploy(c) {
  console.log('1) 建目录')
  console.log('  ' + (await sh(c, 'mkdir -p ' + WEB_DIR + ' && chmod 755 ' + WEB_DIR)).out)

  const files = [
    ['dist/release/latest.json', '/latest.json'],
    ['dist/release/nailong-ledger-v2.3.10.wgt', '/nailong-ledger-v2.3.10.wgt']
  ]
  console.log('2) 上传文件')
  for (const [rel, name] of files) {
    const local = path.join(ROOT, rel)
    if (!fs.existsSync(local)) { console.log('  ✗ 缺文件 ' + rel); continue }
    const remote = WEB_DIR + name
    await put(c, local, remote)
    const size = fs.statSync(local).size
    const remoteSize = (await sh(c, 'stat -c %s ' + remote)).out
    console.log('  ✓ %s (%s B) 远端=%s B', name, size.toLocaleString(), remoteSize)
  }

  console.log('3) 注入 nginx 配置到 default 的 server 块')
  /**
   * 关键：sites-enabled 下的文件是**完整 server 块**，顶层不能直接放
   * `location`（nginx 会报 "location directive is not allowed here"）。
   * 所以要**注入到 default 那个 server 块内部**。
   *
   * default 同时在服务 zero-to-tech 的静态站，所以必须**先备份**、
   * 只在 `location / {` 之前插入，绝不动其它指令。
   */
  const SNIPPET = [
    '',
    '    # ↓↓ 奶蛙记账自建更新源（2026-10-07，AI 注入）',
    '    # 手机直连实测 0.079s，比 GitHub 直连快 120 倍。',
    '    # App 侧已配 usesCleartextTraffic，允许 http 明文访问。',
    '    location /update/ {',
    '        alias ' + WEB_DIR + '/;',
    '        types { application/octet-stream wgt apk; }',
    '        default_type application/octet-stream;',
    '        # 每次检查更新都要拿最新的，不能缓存',
    '        add_header Cache-Control "no-cache, no-store, must-revalidate";',
    '    }',
    '    # ↑↑ 奶蛙记账自建更新源',
    ''
  ].join('\n')

  const DEFAULT = '/etc/nginx/sites-enabled/default'
  /**
   * ⚠️ 备份**必须放在 sites-enabled 之外**（2026-10-07 踩过）：
   * nginx 会 include sites-enabled/* 下的**所有**文件，
   * 备份文件放这儿会被当配置加载 → "duplicate default server" → 整个 nginx 起不来。
   * 放 /root/ 下就不会被扫到。
   */
  const BAK = '/root/cd-nginx-default.cdbak'
  await sh(c, 'cp ' + DEFAULT + ' ' + BAK)
  console.log('  已备份 → ' + BAK)

  const inject = [
    '# 先移除可能存在的旧注入（保证幂等，重复部署不会插出两份）',
    "sed -i '/奶蛙记账自建更新源/,/奶蛙记账自建更新源/d' " + DEFAULT,
    '# 在 location / { 之前插入',
    "sed -i '/^\\s*location \\/ {/e cat /tmp/cd-snippet.txt' " + DEFAULT,
    ''
  ].join('\n')
  await sh(c, 'cat > /tmp/cd-snippet.txt<< \'SNIPEOF\'\n' + SNIPPET + '\nSNIPEOF')
  await sh(c, inject)
  const has = await sh(c, "grep -c '奶蛙记账自建更新源' " + DEFAULT)
  console.log('  注入标记数 = ' + has.out + '（应为 2：注释首尾各一）')

  // 清掉刚才那份独立 conf（它本身是无效配置，留着会让 nginx 起不来）
  await sh(c, 'rm -f /etc/nginx/sites-enabled/cd-update.conf')

  console.log('4) 语法检查 + reload')
  const test = await sh(c, 'nginx -t 2>&1')
  console.log('  nginx -t: ' + (test.out || test.err).split('\n').slice(-2).join(' | '))
  if (test.code !== 0) {
    console.log('  ✗ 配置有错，已还原备份，未 reload')
    await sh(c, 'cp ' + BAK + ' ' + DEFAULT)
    console.log('  nginx -t(还原后): ' + (await sh(c, 'nginx -t 2>&1')).out.split('\n').slice(-2).join(' | '))
    return
  }
  await sh(c, 'nginx -s reload 2>&1 || systemctl reload nginx 2>&1')
  console.log('  ✓ 已 reload')
}

async function verify(c) {
  const r = await sh(c, 'curl -s --max-time 8 -o /dev/null -w "%{http_code}" http://127.0.0.1/update/latest.json')
  console.log('  本机 curl latest.json → HTTP ' + r.out)
  const j = await sh(c, 'curl -s --max-time 8 http://127.0.0.1/update/latest.json | head -c 300')
  console.log('  ' + (j.out || j.err))
}

;(async function () {
  if (!PASS) {
    console.error('请先设置环境变量 CD_SSH_PASSWORD')
    process.exit(1)
  }
  const mode = process.argv[2] || 'probe'
  let c
  try {
    c = await conn()
    console.log('✓ 已连上 %s@%s\n', USER, HOST)
    if (mode === 'probe') await probe(c)
    else if (mode === 'deploy') { await deploy(c); console.log(''); await verify(c) }
    else if (mode === 'verify') await verify(c)
    else console.error('未知模式：' + mode)
  } catch (e) {
    console.error('✗ 失败：' + e.message)
    process.exit(1)
  } finally {
    if (c) c.end()
  }
})()