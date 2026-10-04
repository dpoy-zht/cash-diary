import { describe, it, expect } from 'vitest'
import {
  initialCalcState,
  calcKey,
  calcEquals,
  calcAmountText,
  calcDisplay,
  calcErrorText,
  canEquals,
  canEvaluate,
  canRepeatEquals,
  canClear,
  evalExpression,
  centsToDisplay
} from '../src/utils/calc.js'

/** 模拟一串按键，返回最终状态（测试里不想每次都解包 state） */
function press(keys, from) {
  let st = from || initialCalcState()
  keys.forEach(function (k) {
    const r = calcKey(st, k)
    if (!r.error) st = r.state
  })
  return st
}

describe('数字与小数点输入', () => {
  it('逐位输入，初始为空', () => {
    expect(press(['1']).expr).toBe('1')
    expect(press(['1', '9']).expr).toBe('19')
  })

  it('首位小数点自动补 0（与原键盘行为一致）', () => {
    expect(press(['.']).expr).toBe('0.')
    expect(press(['.', '5']).expr).toBe('0.5')
  })

  it('已有小数点时再按小数点被忽略', () => {
    expect(press(['1', '.', '5', '.']).expr).toBe('1.5')
  })

  it('小数最多 2 位', () => {
    expect(press(['1', '.', '5', '5', '5']).expr).toBe('1.55')
  })

  it('整数最多 9 位（与 parseAmountToCents 上限一致）', () => {
    expect(press('123456789'.split('')).expr).toBe('123456789')
    expect(press('1234567899'.split('')).expr).toBe('123456789')
  })

  it('运算符开头被忽略（不会产生非法表达式）', () => {
    expect(press(['+']).expr).toBe('')
    expect(press(['×']).expr).toBe('')
  })
})

describe('四则运算与优先级（需求点名的用例）', () => {
  it('3+5×2 = 13（不是 16）', () => {
    const st = calcEquals(press(['3', '+', '5', '×', '2']))
    expect(st.error).toBeUndefined()
    expect(st.state.justEvaluated).toBe(true)
    expect(calcAmountText(st.state)).toBe('13.00')
  })

  it('2+3×4-6÷2 = 11', () => {
    const st = calcEquals(press(['2', '+', '3', '×', '4', '-', '6', '÷', '2']))
    expect(calcAmountText(st.state)).toBe('11.00')
  })

  it('同级运算符左结合：100÷10÷2 = 5', () => {
    const st = calcEquals(press(['1', '0', '0', '÷', '1', '0', '÷', '2']))
    expect(calcAmountText(st.state)).toBe('5.00')
  })

  it('末尾再按运算符 = 替换（用户改主意），不会拼出 3++5', () => {
    expect(press(['3', '+']).expr).toBe('3+')
    expect(press(['3', '+', '×']).expr).toBe('3×')
  })

  it('括号等不支持的符号走 bad-char，不静默算错', () => {
    expect(evalExpression('(3+5)×2')).toEqual({ ok: false, error: 'bad-char' })
  })
})

describe('小数与精度（全程整数分，不产生浮点误差）', () => {
  it('0.1+0.2 = 0.30（不是 0.30000000000000004）', () => {
    const st = calcEquals(press(['0', '.', '1', '+', '0', '.', '2']))
    expect(calcAmountText(st.state)).toBe('0.30')
  })

  it('1.5×2 = 3.00', () => {
    expect(calcAmountText(calcEquals(press(['1', '.', '5', '×', '2'])).state)).toBe('3.00')
  })

  it('除法四舍五入到分：1÷3 = 0.33、10÷4 = 2.50', () => {
    expect(calcAmountText(calcEquals(press(['1', '÷', '3'])).state)).toBe('0.33')
    expect(calcAmountText(calcEquals(press(['1', '0', '÷', '4'])).state)).toBe('2.50')
  })

  it('小数参与除法：1÷0.03 = 33.33（分×100÷分，不是错 100 倍）', () => {
    const st = calcEquals(press(['1', '÷', '0', '.', '0', '3']))
    expect(calcAmountText(st.state)).toBe('33.33')
  })
})

describe('非法与不完整输入：可预期、不崩、不出 NaN', () => {
  it('除以 0 → div-by-zero', () => {
    const r = calcEquals(press(['5', '÷', '0']))
    expect(r.error).toBe('div-by-zero')
    expect(r.state.justEvaluated).toBe(false) // 状态不变，用户可以继续改
  })

  it('末尾是运算符时按等号 → incomplete（= 键本身也是禁用的）', () => {
    expect(canEquals(press(['3', '+']))).toBe(false)
    expect(calcEquals(press(['3', '+'])).error).toBe('incomplete')
  })

  it('只有一个数时等号不可用', () => {
    expect(canEquals(press(['3']))).toBe(false)
    expect(calcEquals(press(['3'])).error).toBe('incomplete')
  })

  it('空输入按等号 → incomplete', () => {
    expect(calcEquals(initialCalcState()).error).toBe('incomplete')
  })

  it('结果超出金额上限（9 位整数）→ overflow', () => {
    const r = evalExpression('999999999+1')
    expect(r).toEqual({ ok: false, error: 'overflow' })
  })

  it('中间结果超限也直接失败（不让它继续参与运算）', () => {
    expect(evalExpression('999999999×9+1').ok).toBe(false)
  })

  it('任何按键序列下金额都不会是 NaN / undefined', () => {
    const seqs = [
      ['0', '.', '5', '÷', '0'],
      ['9', '9', '9', '9', '9', '9', '9', '9', '9', '9', '+', '1'],
      ['1', '+', '+', '5'],
      ['.', '.', '.']
    ]
    seqs.forEach(function (seq) {
      const st = press(seq)
      const r = calcEquals(st)
      const text = calcAmountText(r.error ? st : r.state)
      expect(String(text)).not.toContain('NaN')
      expect(String(text)).not.toContain('undefined')
      expect(String(text)).not.toContain('Infinity')
    })
  })

  it('错误码都有可读文案', () => {
    expect(calcErrorText('div-by-zero')).toBe('除数不能为 0 哦')
    expect(calcErrorText('overflow')).toBe('金额太大啦，算不过来')
    expect(calcErrorText('bad-char')).toBe('算式里有看不懂的符号')
    expect(calcErrorText('incomplete')).toBe('算式还没写完')
  })
})

describe('退格与清空', () => {
  it('退格删掉上一位', () => {
    expect(press(['1', '9', 'del']).expr).toBe('1')
  })

  it('退格也能删运算符与小数点', () => {
    expect(press(['1', '2', '+', 'del']).expr).toBe('12')
    expect(press(['1', '.', '5', 'del']).expr).toBe('1.')
  })

  it('结果态下退格 = 清空（展示回落 0.00，不会出现空显示）', () => {
    const done = calcEquals(press(['3', '+', '5'])).state
    const cleared = press(['del'], done)
    expect(cleared.expr).toBe('')
    expect(calcAmountText(cleared)).toBe('')
    expect(calcDisplay(cleared)).toBe('0.00')
  })

  it('clear 回到初始态（可提交金额为空）', () => {
    const st = calcKey(press(['1', '2', '3']), 'clear').state
    expect(st.expr).toBe('')
    expect(calcAmountText(st)).toBe('')
    expect(canClear(st)).toBe(false)
  })

  it('退格把算式删成不完整时，等号自动禁用', () => {
    const st = press(['3', '+', '5', 'del'])
    expect(st.expr).toBe('3+')
    expect(canEquals(st)).toBe(false)
  })
})

describe('重复等号与结果复用', () => {
  it('3+5= → 8，再 = → 13，再 = → 18（重放上一次的运算）', () => {
    let st = calcEquals(press(['3', '+', '5'])).state
    expect(calcAmountText(st)).toBe('8.00')
    st = calcEquals(st).state
    expect(calcAmountText(st)).toBe('13.00')
    st = calcEquals(st).state
    expect(calcAmountText(st)).toBe('18.00')
  })

  it('乘法同样可重复：2×3= → 6，再 = → 18（重放 6×3，与系统计算器一致）', () => {
    let st = calcEquals(press(['2', '×', '3'])).state
    expect(calcAmountText(st)).toBe('6.00')
    st = calcEquals(st).state
    expect(calcAmountText(st)).toBe('18.00')
  })

  it('结果参与下一次运算：2+3= → 5，按 + 4 = → 9', () => {
    const done = calcEquals(press(['2', '+', '3'])).state
    const next = press(['+', '4'], done)
    expect(next.expr).toBe('5+4')
    expect(calcAmountText(calcEquals(next).state)).toBe('9.00')
  })

  it('结果后直接按数字 = 重新开始（不接在结果后面）', () => {
    const done = calcEquals(press(['2', '+', '3'])).state
    expect(press(['9'], done).expr).toBe('9')
  })

  it('结果后按运算符，以结果为左操作数', () => {
    const done = calcEquals(press(['2', '+', '3'])).state
    expect(press(['×'], done).expr).toBe('5×')
  })
})

describe('页面展示与可提交金额', () => {
  it('纯数字时展示千分位（沿用原样式）', () => {
    expect(calcDisplay(press(['1', '9', '9', '0']))).toBe('1,990')
    expect(centsToDisplay(180000)).toBe('1,800.00')
    expect(centsToDisplay(5)).toBe('0.05')
    expect(centsToDisplay(-5)).toBe('-0.05')
  })

  it('空输入展示 0.00（与原型图一致）', () => {
    expect(calcDisplay(initialCalcState())).toBe('0.00')
  })

  it('算式中展示表达式本身（让用户看见自己按了什么）', () => {
    expect(calcDisplay(press(['3', '+', '5', '×', '2']))).toBe('3+5×2')
  })

  it('算出结果后展示金额（千分位）', () => {
    const st = calcEquals(press(['3', '+', '5', '×', '2'])).state
    expect(calcDisplay(st)).toBe('13.00')
  })

  it('算式没算完时不给可提交金额（避免把半截算式存进去）', () => {
    expect(calcAmountText(press(['3', '+', '5']))).toBe('')
    expect(calcAmountText(press(['3', '+']))).toBe('')
  })

  it('纯数字与已算出的结果都是可提交金额', () => {
    expect(calcAmountText(press(['1', '9', '.', '9', '0']))).toBe('19.90')
    expect(calcAmountText(calcEquals(press(['3', '+', '5', '×', '2'])).state)).toBe('13.00')
  })

  it('canClear 有内容才为真', () => {
    expect(canClear(initialCalcState())).toBe(false)
    expect(canClear(press(['1']))).toBe(true)
  })
})

describe('键盘门控契约（集成 bug 回归）—— 键盘会按 canEquals 置灰，键必须真的能按到', () => {
  /**
   * 模拟 money-keyboard 的行为：等号键不可用就直接丢事件。
   * 这条测试的价值在于：单元测试直接调 calcEquals 会绕过键盘这道门，
   * 于是「重复按等号」在 UI 上按不到的问题就漏过去了（实际发生过）。
   */
  function pressViaKeyboard(keys, from) {
    let st = from || initialCalcState()
    keys.forEach(function (k) {
      if (k === '=') {
        if (!canEquals(st)) return // ← 键盘的置灰逻辑
        const r = calcEquals(st)
        if (!r.error) st = r.state
        return
      }
      const r = calcKey(st, k)
      if (!r.error) st = r.state
    })
    return st
  }

  it('算出结果后等号**仍然可点**（否则重复等号功能按不到）', () => {
    const done = calcEquals(press(['3', '+', '5'])).state
    expect(done.justEvaluated).toBe(true)
    expect(canEquals(done)).toBe(true)
    expect(canRepeatEquals(done)).toBe(true)
  })

  it('走键盘门控，3+5= 连按三次得到 8 → 13 → 18', () => {
    let st = pressViaKeyboard(['3', '+', '5', '=', '=', '='])
    expect(calcAmountText(st)).toBe('18.00')
    // 分步核对，确认每一步都真的被键盘放行
    st = pressViaKeyboard(['3', '+', '5', '='])
    expect(calcAmountText(st)).toBe('8.00')
    st = pressViaKeyboard(['='], st)
    expect(calcAmountText(st)).toBe('13.00')
    st = pressViaKeyboard(['='], st)
    expect(calcAmountText(st)).toBe('18.00')
  })

  it('canEvaluate 在结果态为 false —— 这正是「完成」不能重复上一步的原因', () => {
    const done = calcEquals(press(['3', '+', '5'])).state
    expect(canEvaluate(done)).toBe(false)
    // 完成键的结算判据若误用 canEquals，会把 8 变成 13；用 canEvaluate 则保持 8
    expect(calcAmountText(done)).toBe('8.00')
  })

  it('纯数字输入时等号仍不可点（没有可算的算式，也没有可重复的上一步）', () => {
    const st = press(['7'])
    expect(canEquals(st)).toBe(false)
    expect(canRepeatEquals(st)).toBe(false)
  })

  it('清空后等号不可点（重复等号的状态被一起清掉）', () => {
    const done = calcEquals(press(['3', '+', '5'])).state
    const cleared = calcKey(done, 'clear').state
    expect(canEquals(cleared)).toBe(false)
    expect(canRepeatEquals(cleared)).toBe(false)
  })

  it('除法结果同样可重复：10÷4= → 2.50，再 = → 0.63（重放 2.5÷4）', () => {
    let st = pressViaKeyboard(['1', '0', '÷', '4', '='])
    expect(calcAmountText(st)).toBe('2.50')
    st = pressViaKeyboard(['='], st)
    expect(calcAmountText(st)).toBe('0.63') // 2.50 ÷ 4 = 0.625 → 四舍五入到分
  })
})

describe('算式未写完时的显示（回归：不要回退成 0.00）', () => {
  it('输入 7+ 时显示表达式本身，而不是 0.00', () => {
    expect(calcDisplay(press(['7', '+']))).toBe('7+')
  })

  it('输入 3+5× 也保持原样显示', () => {
    expect(calcDisplay(press(['3', '+', '5', '×']))).toBe('3+5×')
  })

  it('纯数字仍走金额展示（千分位），不含运算符', () => {
    expect(calcDisplay(press(['1', '9', '9', '0']))).toBe('1,990')
  })

  it('空输入仍是 0.00', () => {
    expect(calcDisplay(initialCalcState())).toBe('0.00')
  })
})
