/**
 * SQL 字面量转义：plus.sqlite 不支持参数绑定，值统一经此函数拼入 SQL 字符串。
 * 数字原样输出；字符串单引号包裹并内嵌引号转义；null/undefined → NULL。
 */
export function sqlValue(v) {
  if (v === null || v === undefined) return 'NULL'
  if (typeof v === 'number') return String(Math.trunc(v))
  return "'" + String(v).replace(/'/g, "''") + "'"
}

/**
 * LIKE 模式字面量：把用户输入变成"包含匹配"的安全模式串。
 * 反斜杠/百分号/下划线都用反斜杠转义（SQL 侧要配 ESCAPE '\' 使用），
 * 单引号按 SQL 规则双写。顺序必须先转反斜杠，否则会二次转义。
 */
export function likePattern(v) {
  const s = String(v == null ? '' : v)
  const escaped = s
    .replace(/\\/g, '\\\\')
    .replace(/'/g, "''")
    .replace(/%/g, '\\%')
    .replace(/_/g, '\\_')
  return "'%" + escaped + "%'"
}
