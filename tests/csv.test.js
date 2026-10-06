import { describe, it, expect } from 'vitest'
import {
  TX_CSV_HEADER,
  CSV_BOM,
  csvCell,
  toCsv,
  withBom,
  fmtDateTime,
  centsToYuan,
  csvFileName,
  buildTxCsvRows,
  buildTxCsv
} from '../src/utils/csv.js'

const at = function (y, mo, d, h, mi) {
  return new Date(y, mo - 1, d, h, mi, 0, 0).getTime()
}

describe('T4.2 —— CSV 单元格转义', () => {
  it('普通值原样输出（不加引号）', () => {
    expect(csvCell('早餐')).toBe('早餐')
    expect(csvCell('2026-09-30 22:10')).toBe('2026-09-30 22:10')
    expect(csvCell(38)).toBe('38')
    expect(csvCell(0)).toBe('0')
  })

  it('null / undefined 一律输出空串（不是 "null" 字符串）', () => {
    expect(csvCell(null)).toBe('')
    expect(csvCell(undefined)).toBe('')
  })

  it('含逗号 / 双引号 / 换行的单元格必须加引号包裹', () => {
    expect(csvCell('奶茶,小零食')).toBe('"奶茶,小零食"')
    expect(csvCell('他说"好"')).toBe('"他说""好"""')
    expect(csvCell('第一行\n第二行')).toBe('"第一行\n第二行"')
    expect(csvCell('a\r\nb')).toBe('"a\r\nb"')
  })

  it('公式注入防护：= + @ 制表符 开头的前置单引号', () => {
    expect(csvCell('=1+1')).toBe("'=1+1")
    expect(csvCell('+SUM(A1)')).toBe("'+SUM(A1)")
    expect(csvCell('@cmd')).toBe("'@cmd")
    expect(csvCell('\tstart')).toBe("'\tstart")
  })

  it('"-" 开头：数字保持数字，文本才加防护（否则金额列会被当成文本）', () => {
    expect(csvCell('-38.00')).toBe('-38.00') // 数字，不能加引号
    expect(csvCell('-1')).toBe('-1')
    expect(csvCell('-2-3')).toBe("'-2-3") // 不是合法数字 → 防注入
    expect(csvCell('-cmd')).toBe("'-cmd")
  })

  it('既需要防护又需要引号时，两者同时生效且顺序正确', () => {
    expect(csvCell('=a,b')).toBe('"\'=a,b"')
  })
})

describe('T4.2 —— CSV 文本拼装', () => {
  it('用 CRLF 分行，行内用逗号分列', () => {
    expect(toCsv([['a', 'b'], ['c', 'd']])).toBe('a,b\r\nc,d')
  })

  it('空输入 / 结构不对时返回空串，不抛错', () => {
    expect(toCsv([])).toBe('')
    expect(toCsv(null)).toBe('')
    expect(toCsv(undefined)).toBe('')
    expect(toCsv([null, 'x'])).toBe('\r\n')
  })

  it('withBom 加 UTF-8 BOM，且幂等（不重复加）', () => {
    expect(withBom('a')).toBe(CSV_BOM + 'a')
    expect(withBom(CSV_BOM + 'a')).toBe(CSV_BOM + 'a')
    expect(withBom('').charCodeAt(0)).toBe(0xfeff)
    expect(withBom(null)).toBe(CSV_BOM)
  })

  it('BOM 的字节序列是 EF BB BF（Excel 靠它认 UTF-8）', () => {
    const bytes = Array.from(new TextEncoder().encode(CSV_BOM))
    expect(bytes).toEqual([0xef, 0xbb, 0xbf])
  })
})

describe('T4.2 —— 时间 / 金额 / 文件名', () => {
  it('fmtDateTime：本地时间到分钟，补零', () => {
    expect(fmtDateTime(at(2026, 9, 30, 22, 10))).toBe('2026-09-30 22:10')
    expect(fmtDateTime(at(2026, 1, 5, 8, 3))).toBe('2026-01-05 08:03')
  })

  it('centsToYuan：整数分转元，不经过浮点', () => {
    expect(centsToYuan(1990, false)).toBe('19.90')
    expect(centsToYuan(5, false)).toBe('0.05')
    expect(centsToYuan(0, false)).toBe('0.00')
    expect(centsToYuan(1200000, true)).toBe('-12000.00')
    expect(centsToYuan(123456789, false)).toBe('1234567.89')
  })

  it('centsToYuan：负数入参按绝对值处理（符号由第二个参数决定）', () => {
    expect(centsToYuan(-1990, true)).toBe('-19.90')
    expect(centsToYuan(-1990, false)).toBe('19.90')
  })

  it('csvFileName：奶蛙记账-账单-YYYY-MM-DD-HHmm.csv', () => {
    expect(csvFileName(at(2026, 9, 30, 22, 10))).toBe('奶蛙记账-账单-2026-09-30-2210.csv')
    expect(csvFileName(at(2026, 1, 5, 8, 3))).toBe('奶蛙记账-账单-2026-01-05-0803.csv')
  })
})

describe('T4.2 —— 整库表 → CSV 行', () => {
  const tables = {
    account: [
      { id: 1, name: '日常账本' },
      { id: 2, name: '旅行账本' }
    ],
    category: [
      { id: 1, name: '餐饮' },
      { id: 5, name: '工资' }
    ],
    transaction_record: [
      { id: 11, account_id: 1, category_id: 1, type: 'expense', amount_cents: 3800, note: '早餐', occurred_at: at(2026, 9, 30, 8, 0), deleted_at: null },
      { id: 10, account_id: 1, category_id: 5, type: 'income', amount_cents: 1200000, note: '九月工资', occurred_at: at(2026, 9, 1, 9, 0), deleted_at: null },
      { id: 12, account_id: 2, category_id: 1, type: 'expense', amount_cents: 9900, note: '已删掉的账', occurred_at: at(2026, 9, 15, 12, 0), deleted_at: at(2026, 9, 20, 12, 0) }
    ]
  }

  it('首行是表头', () => {
    expect(buildTxCsvRows(tables)[0]).toEqual(TX_CSV_HEADER)
  })

  it('软删除的记录不导出（备份要留，账单不该留）', () => {
    const rows = buildTxCsvRows(tables)
    expect(rows).toHaveLength(3) // 表头 + 2 条
    expect(JSON.stringify(rows)).not.toContain('已删掉的账')
  })

  it('按 occurred_at 升序（看账单习惯是从早到晚）', () => {
    const rows = buildTxCsvRows(tables)
    expect(rows[1][0]).toBe('2026-09-01 09:00')
    expect(rows[2][0]).toBe('2026-09-30 08:00')
  })

  it('类型 / 分类名 / 账本名 / 金额符号都正确', () => {
    const rows = buildTxCsvRows(tables)
    expect(rows[1]).toEqual(['2026-09-01 09:00', '收入', '工资', '12000.00', '九月工资', '日常账本', ''])
    expect(rows[2]).toEqual(['2026-09-30 08:00', '支出', '餐饮', '-38.00', '早餐', '日常账本', ''])
  })

  it('分类 / 账本 id 对不上时退化成「其他」与空串，不崩也不写 undefined', () => {
    const rows = buildTxCsvRows({
      category: [],
      account: [],
      transaction_record: [
        { id: 1, account_id: 99, category_id: 99, type: 'expense', amount_cents: 100, note: '', occurred_at: at(2026, 9, 30, 8, 0) }
      ]
    })
    expect(rows[1]).toEqual(['2026-09-30 08:00', '支出', '其他', '-1.00', '', '', ''])
  })

  it('空库 / 结构不对时只有表头，不抛错', () => {
    expect(buildTxCsvRows(null)).toEqual([TX_CSV_HEADER])
    expect(buildTxCsvRows({})).toEqual([TX_CSV_HEADER])
    expect(buildTxCsvRows({ transaction_record: null })).toEqual([TX_CSV_HEADER])
  })

  it('T5.1 标签列：多个标签用 | 连接（逗号留给 CSV 分隔符）；没打过标签留空', () => {
    const rows = buildTxCsvRows({
      category: [{ id: 1, name: '餐饮' }],
      account: [{ id: 1, name: '日常账本' }],
      tag: [{ id: 1, name: '报销' }, { id: 2, name: '出差' }],
      transaction_tag: [
        { transaction_id: 1, tag_id: 1 },
        { transaction_id: 1, tag_id: 2 },
        { transaction_id: 2, tag_id: 1 }
      ],
      transaction_record: [
        { id: 1, account_id: 1, category_id: 1, type: 'expense', amount_cents: 100, note: 'a', occurred_at: at(2026, 9, 1, 8, 0) },
        { id: 2, account_id: 1, category_id: 1, type: 'expense', amount_cents: 200, note: 'b', occurred_at: at(2026, 9, 2, 8, 0) },
        { id: 3, account_id: 1, category_id: 1, type: 'expense', amount_cents: 300, note: 'c', occurred_at: at(2026, 9, 3, 8, 0) }
      ]
    })
    expect(rows[1][6]).toBe('报销|出差')
    expect(rows[2][6]).toBe('报销')
    expect(rows[3][6]).toBe('') // 没打标签
  })

  it('T5.1 标签列：老备份（没有 tag 两张表）不抛错、整列为空', () => {
    const rows = buildTxCsvRows({
      category: [{ id: 1, name: '餐饮' }],
      account: [{ id: 1, name: '日常账本' }],
      transaction_record: [
        { id: 1, account_id: 1, category_id: 1, type: 'expense', amount_cents: 100, note: '', occurred_at: at(2026, 9, 1, 8, 0) }
      ]
    })
    expect(rows[1][6]).toBe('')
  })

  it('T5.1 标签列：关联指向不存在的标签时忽略（不写 undefined）', () => {
    const rows = buildTxCsvRows({
      category: [{ id: 1, name: '餐饮' }],
      account: [{ id: 1, name: '日常账本' }],
      tag: [{ id: 1, name: '报销' }],
      transaction_tag: [{ transaction_id: 1, tag_id: 1 }, { transaction_id: 1, tag_id: 999 }],
      transaction_record: [
        { id: 1, account_id: 1, category_id: 1, type: 'expense', amount_cents: 100, note: '', occurred_at: at(2026, 9, 1, 8, 0) }
      ]
    })
    expect(rows[1][6]).toBe('报销')
  })

  it('buildTxCsv：文本以 BOM 开头、表头在最前、CRLF 分行', () => {
    const text = buildTxCsv(tables)
    expect(text.charAt(0)).toBe(CSV_BOM)
    const lines = text.slice(1).split('\r\n')
    expect(lines[0]).toBe(TX_CSV_HEADER.join(','))
    expect(lines).toHaveLength(3)
    expect(text).not.toContain('\n\n')
  })

  it('备注里的逗号/引号经过转义后能被标准解析器还原（往返一致）', () => {
    const text = buildTxCsv({
      transaction_record: [
        { id: 1, account_id: 1, category_id: 1, type: 'expense', amount_cents: 100, note: '奶茶,"加料"', occurred_at: at(2026, 9, 30, 8, 0) }
      ]
    })
    const body = text.slice(1).split('\r\n')[1]
    expect(body).toContain('"奶茶,""加料"""')
    expect(parseCsvLine(body)).toEqual(['2026-09-30 08:00', '支出', '其他', '-1.00', '奶茶,"加料"', '', ''])
  })

  it('备注带换行时会整体加引号，行数不会因此变多', () => {
    const text = buildTxCsv({
      transaction_record: [
        { id: 1, account_id: 1, category_id: 1, type: 'expense', amount_cents: 100, note: '第一行\n第二行', occurred_at: at(2026, 9, 30, 8, 0) }
      ]
    })
    // 表头 + 1 条数据（内部那个 \n 被引号包住，不构成新记录）
    expect(text.slice(1).split('\r\n')).toHaveLength(2)
  })
})

/** 最小 RFC4180 解析器：仅用于验证转义是「可还原」的 */
function parseCsvLine(line) {
  const out = []
  let cur = ''
  let inQ = false
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i]
    if (inQ) {
      if (ch === '"') {
        if (line[i + 1] === '"') { cur += '"'; i += 1 } else inQ = false
      } else cur += ch
    } else if (ch === '"') inQ = true
    else if (ch === ',') { out.push(cur); cur = '' }
    else cur += ch
  }
  out.push(cur)
  return out
}
