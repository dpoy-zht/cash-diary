/**
 * 临时工具：把 latest.json + wgt 推到自建更新源。
 *
 * 为什么不用 release.js：release.js 在 Node 里 spawnSync 托管 python，
 * 被沙箱拦成 EBUSY（本机限制）；而 gen-latest-json.py 已手工跑过，
 * 所以这里只保留「上传」这一半，且只用 ssh2 + fs（不 spawn 任何东西）。
 *
 * 用法：CD_SSH_PASSWORD=xxx node dist/dev/push-update.js <wgt 文件名>
 */
const fs = require('fs')
const path = require('path')
const { Client } = require('ssh2')

const HOST = process.env.CD_SSH_HOST || '121.40.24.123'
const USER = process.env.CD_SSH_USER || 'root'
const PASS = process.env.CD_SSH_PASSWORD || ''
const WEB_DIR = '/var/www/cash-diary/update'
const ROOT = path.resolve(__dirname, '..', '..')

const wgtName = process.argv[2]
if (!wgtName) {
  console.error('用法: node dist/dev/push-update.js <wgt 文件名>')
  process.exit(1)
}

function conn() {
  return new Promise((resolve, reject) => {
    const c = new Client()
    c.on('ready', () => resolve(c))
    c.on('error', reject)
    c.connect({ host: HOST, port: 22, username: USER, password: PASS, readyTimeout: 20000 })
  })
}

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

/** base64 分块写盘（该机 SFTP 不可用，只能 exec；块 ≤48KB 才不被掐连接） */
function put(c, local, remote) {
  return new Promise((resolve, reject) => {
    const data = fs.readFileSync(local)
    const CHUNK = 48 * 1024
    let i = 0
    const next = () => {
      if (i * CHUNK >= data.length) return resolve()
      const b64 = data.slice(i * CHUNK, (i + 1) * CHUNK).toString('base64')
      const redir = i === 0 ? '>' : '>>'
      sh(c, 'echo -n "' + b64 + '" | base64 -d ' + redir + ' ' + remote)
        .then((r) => {
          if (r.code !== 0) return reject(new Error('chunk ' + i + ' 失败: ' + (r.err || r.out)))
          i += 1
          next()
        })
        .catch(reject)
    }
    next()
  })
}

async function main() {
  const c = await conn()
  try {
    console.log('1) 建目录')
    console.log('  ' + (await sh(c, 'mkdir -p ' + WEB_DIR + ' && chmod 755 ' + WEB_DIR)).out)

    const files = [
      ['dist/release/latest.json', '/latest.json'],
      ['dist/release/' + wgtName, '/' + wgtName]
    ]
    console.log('2) 上传文件')
    for (const [rel, name] of files) {
      const local = path.join(ROOT, rel)
      if (!fs.existsSync(local)) { console.log('  ✗ 缺文件 ' + rel); continue }
      await put(c, local, WEB_DIR + name)
      const size = fs.statSync(local).size
      const remoteSize = (await sh(c, 'stat -c %s ' + WEB_DIR + name)).out
      console.log('  ✓ ' + name + ' 本地=' + size + ' B 远端=' + remoteSize + ' B ' +
        (String(size) === remoteSize ? 'OK' : '!!! 大小不一致'))
    }

    console.log('3) 远端自检')
    const r = await sh(c, 'curl -s --max-time 8 -o /dev/null -w "%{http_code} %{size_download}\\n" ' +
      'http://127.0.0.1/update/latest.json')
    console.log('  latest.json → ' + (r.out || r.err))
    const r2 = await sh(c, 'curl -s --max-time 20 -o /dev/null -w "%{http_code} %{size_download}\\n" ' +
      'http://127.0.0.1/update/' + wgtName)
    console.log('  ' + wgtName + ' → ' + (r2.out || r2.err))
    const r3 = await sh(c, 'cat ' + WEB_DIR + '/latest.json')
    console.log('  远端 latest.json: ' + r3.out.replace(/\s+/g, ' '))
  } finally {
    c.end()
  }
}

main().catch((e) => { console.error('FAIL ' + e.message); process.exitCode = 1 })
