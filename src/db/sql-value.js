/**
 * SQL 字面量转义：plus.sqlite 不支持参数绑定，值统一经此函数拼入 SQL 字符串。
 * 数字原样输出；字符串单引号包裹并内嵌引号转义；null/undefined → NULL。
 */
export function sqlValue(v) {
  if (v === null || v === undefined) return 'NULL'
  if (typeof v === 'number') return String(Math.trunc(v))
  return "'" + String(v).replace(/'/g, "''") + "'"
}
