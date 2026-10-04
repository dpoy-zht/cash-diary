/**
 * 计算器式金额输入引擎（记一笔页用）—— 纯函数，不碰 uni / DOM，全部可单测。
 *
 * 设计要点（每条都有原因，改动前先读）：
 *
 * 1. **优先级靠双栈调度场算法**（调度场法 / shunting-yard）：
 *    运算符分两优先级（×÷ > +−），遇同级/更低级出栈计算。
 *    所以 `3+5×2` = 13 而不是 16 —— 这是需求里明确点名的用例。
 *
 * 2. **全程以「分」为整数运算**（本项目金额铁律：整数分、禁浮点存储）：
 *    - 加减：分直接整数相加相减 → `0.1+0.2` 精确得 `0.30`，
 *      不会像浮点那样冒出 `0.30000000000000004`。
 *    - 乘法：分×分 ÷ 100（因为 (a/100)×(b/100) 元 = a·b/100 分）
 *    - 除法：分 × 100 ÷ 分（因为 (a/100)÷(b/100) 元 = 100a/b 分）
 *    - 每次运算后 Math.round 回分，杜绝误差累积。
 *
 * 3. **永不返回 NaN / Infinity**：除零、超限、非法字符都走结构化 error，
 *    由页面转成提示文案。调用方只需看 `ok`。
 *
 * 4. **状态机而不是字符串拼接**：
 *    - `expr` 是用户看到的表达式（内部运算符用 + - × ÷ 显示友好字符）
 *    - `lastOp` / `lastOperand` 支撑「重复按 =」与「结果参与下一次运算」
 *    - `justEvaluated` 标记"刚算出结果"，此时按数字应**重新开始**而不是接在结果后面
 *
 * 5. **与既有金额口径一致**：结果整数部分最多 9 位（`parseAmountToCents` 的上限），
 *    最多 2 位小数；超限返回 `overflow`，由页面提示，避免算出一个存不进去的金额。
 */

/** 显示用运算符（内部统一用这四个字符，避免星号斜杠与手机键盘符号歧义） */
export const OPS = ['+', '-', '×', '÷']

/** 金额上限：整数 9 位（与 utils/money.js 的 parseAmountToCents 同口径） */
const MAX_INT_DIGITS = 9

const PRECEDENCE = { '+': 1, '-': 1, '×': 2, '÷': 2 }
const RIGHT_ASSOC = {}

/** 初始状态（空输入；展示 0.00 由页面格式化） */
export function initialCalcState() {
  return { expr: '', lastOp: '', lastOperand: null, justEvaluated: false }
}

/** '0.05' / '.05' / '5' → 分；非法返回 null */
function toCents(token) {
  if (!/^\d+(\.\d+)?$/.test(token)) return null
  const n = Number(token)
  if (!isFinite(n)) return null
  return Math.round(n * 100)
}

/** 分 → 展示用数字字符串（整数部分不超过上限时返回 'x.xx'） */
function centsToNumberString(cents) {
  const neg = cents < 0
  const abs = Math.abs(Math.round(cents))
  const intPart = Math.floor(abs / 100)
  if (String(intPart).length > MAX_INT_DIGITS) return null
  return (neg ? '-' : '') + intPart + '.' + String(abs % 100).padStart(2, '0')
}

/**
 * 分 → **紧凑**数字字符串：整数结果不带小数尾巴（5.00 → '5'）。
 * 算式续算时用它当左操作数，避免算出 5.00 之后接着按数字被误判成"小数已满 2 位"。
 * 金额**展示**仍走 centsToDisplay（永远两位小数），两者刻意分开。
 */
function compactNumberString(cents) {
  const abs = Math.abs(Math.round(cents))
  if (abs % 100 === 0) {
    const intPart = abs / 100
    if (String(intPart).length > MAX_INT_DIGITS) return null
    return (cents < 0 ? '-' : '') + intPart
  }
  return centsToNumberString(cents)
}

/** 分 → 千分位展示（整数部分超限返回 null） */
export function centsToDisplay(cents) {
  const s = centsToNumberString(cents)
  if (s === null) return null
  const neg = s.charAt(0) === '-'
  const body = neg ? s.slice(1) : s
  const parts = body.split('.')
  let intStr = ''
  const ip = parts[0]
  for (let i = 0; i < ip.length; i += 1) {
    if (i > 0 && (ip.length - i) % 3 === 0) intStr += ','
    intStr += ip.charAt(i)
  }
  return (neg ? '-' : '') + intStr + '.' + parts[1]
}

/** 运算符右操作数：把 '5' '5.' '.5' 规整成可解析形式（'5' → '5'，'5.' → '5'） */
function normalizeOperand(raw) {
  if (raw === '' || raw === '.') return null
  if (!/^\d*\.?\d*$/.test(raw)) return null
  const s = raw.indexOf('.') === 0 ? '0' + raw : raw.replace(/\.$/, '')
  return /^\d+(\.\d+)?$/.test(s) ? s : null
}

/** 切出表达式里"当前正在输入的那个操作数"（末尾那段数字） */
function currentOperand(expr) {
  const m = /(\d*\.?\d*)$/.exec(expr)
  return m ? m[1] : ''
}

/** 表达式里是否含运算符 */
function containsOperator(expr) {
  for (let i = 0; i < expr.length; i += 1) {
    if (OPS.indexOf(expr.charAt(i)) !== -1) return true
  }
  return false
}

/** 表达式末尾是否是运算符（= 未完成的标志） */
function endsWithOperator(expr) {
  const c = expr.charAt(expr.length - 1)
  return OPS.indexOf(c) !== -1
}

/**
 * 算式求值（调度场算法）。
 * @returns {{ok:true, cents:number}|{ok:false, error:'incomplete'|'div-by-zero'|'bad-char'|'overflow'}}
 */
export function evalExpression(expr) {
  const s = String(expr || '').replace(/\s+/g, '')
  if (!s) return { ok: false, error: 'incomplete' }
  if (endsWithOperator(s)) return { ok: false, error: 'incomplete' }

  const tokens = []
  let i = 0
  while (i < s.length) {
    const c = s.charAt(i)
    if (c >= '0' && c <= '9') {
      let j = i
      while (j < s.length && /[\d.]/.test(s.charAt(j))) j += 1
      const num = s.slice(i, j)
      // 多个小数点 / 结尾的点在这里被 normalizeOperand 规则挡掉
      if ((num.match(/\./g) || []).length > 1) return { ok: false, error: 'bad-char' }
      if (num === '.') return { ok: false, error: 'incomplete' }
      const fixed = num.indexOf('.') === 0 ? '0' + num : num.replace(/\.$/, '')
      if (!/^\d+(\.\d+)?$/.test(fixed)) return { ok: false, error: 'bad-char' }
      tokens.push({ t: 'n', v: toCents(fixed) })
      i = j
      continue
    }
    if (OPS.indexOf(c) !== -1) {
      // 连续的运算符（3++5）直接判非法，不做"自动纠正"，避免用户以为自己按错了
      const prev = tokens[tokens.length - 1]
      if (!prev || prev.t !== 'n') return { ok: false, error: 'incomplete' }
      tokens.push({ t: 'o', v: c })
      i += 1
      continue
    }
    // 也接受 * / x X 作为乘除的等价输入（粘贴场景）
    if (c === '*' || c === 'x' || c === 'X') { tokens.push({ t: 'o', v: '×' }); i += 1; continue }
    if (c === '/') { tokens.push({ t: 'o', v: '÷' }); i += 1; continue }
    return { ok: false, error: 'bad-char' }
  }
  if (!tokens.length) return { ok: false, error: 'incomplete' }
  if (tokens[0].t !== 'n') return { ok: false, error: 'incomplete' }

  const values = []
  const ops = []
  // 返回 'ok' / 'div-by-zero' / 'overflow'：除零必须在**出栈当场**判定，
  // 因为 apply 内部已经把运算符出栈了，事后靠栈里还剩什么来判断是不准的。
  const apply = () => {
    const op = ops.pop()
    const b = values.pop()
    const a = values.pop()
    if (a === undefined || b === undefined) return 'incomplete'
    let cents
    if (op === '+') cents = a + b
    else if (op === '-') cents = a - b
    else if (op === '×') cents = Math.round((a * b) / 100)
    else {
      if (b === 0) return 'div-by-zero'
      cents = Math.round((a * 100) / b)
    }
    if (!isFinite(cents)) return 'overflow'
    // 每步都判上限：中间结果超限就直接失败，不让它继续参与后续运算
    if (String(Math.floor(Math.abs(cents) / 100)).length > MAX_INT_DIGITS) return 'overflow'
    values.push(cents)
    return 'ok'
  }

  for (let k = 0; k < tokens.length; k += 1) {
    const tk = tokens[k]
    if (tk.t === 'n') { values.push(tk.v); continue }
    while (ops.length && PRECEDENCE[ops[ops.length - 1]] >= PRECEDENCE[tk.v] && !RIGHT_ASSOC[tk.v]) {
      const r = apply()
      if (r !== 'ok') return { ok: false, error: r }
    }
    ops.push(tk.v)
  }
  while (ops.length) {
    const r = apply()
    if (r !== 'ok') return { ok: false, error: r }
  }
  if (values.length !== 1) return { ok: false, error: 'incomplete' }
  return { ok: true, cents: values[0] }
}

/**
 * 表达式是否「完整可算」：含运算符、且不以运算符结尾。
 * 这是**结算**的判据（保存前结算、算不完整就别算），不等同于「等号键可不可点」。
 */
export function canEvaluate(state) {
  const s = state && state.expr ? state.expr : ''
  if (!s || endsWithOperator(s)) return false
  for (let i = 0; i < s.length; i += 1) {
    if (OPS.indexOf(s.charAt(i)) !== -1) return true
  }
  return false
}

/**
 * 刚算出结果且记录了上一步运算 → 可以**重复按等号**重放（3+5= → 8 → 13 → 18）。
 * 单独拎出来是因为它与 canEvaluate 是两回事：结果态下 expr 是 '8'（不含运算符），
 * canEvaluate 判 false，但等号键**必须仍然可点**，否则「重复等号」根本按不到
 * （这正是集成测试抓到的 bug：单元测试直接调 calcEquals 绕过了键盘这道门）。
 */
export function canRepeatEquals(state) {
  if (!state || !state.justEvaluated || !state.lastOp) return false
  return state.lastOperand !== null && state.lastOperand !== undefined
}

/**
 * 等号键是否可点：能算 或 能重复上一步。
 * 注意：**不能拿它当「能不能结算」的判据**（那要用 canEvaluate），
 * 否则「完成」会把上一步运算再重放一次（算完 8，点完成却存成 13）。
 */
export function canEquals(state) {
  return canEvaluate(state) || canRepeatEquals(state)
}

/** 是否可清空（有内容才可点，避免无意义操作） */
export function canClear(state) {
  return !!(state && state.expr) || (state && state.justEvaluated) === true
}

/** 当前"可提交金额"：算出结果就返回结果；表达式不完整时返回正在输入的那个数 */
export function calcAmountText(state) {
  if (!state || !state.expr) return ''
  if (state.justEvaluated) return centsToNumberString(state.lastResultCents) || ''
  if (canEvaluate(state)) return '' // 算式还没算完，不能拿去保存
  return normalizeOperand(currentOperand(state.expr)) || ''
}

/**
 * 按键状态机主入口。
 * @param {object} state 当前状态
 * @param {string} key  '0'-'9' | '.' | '+'|'-'|'×'|'÷' | 'del' | 'clear' | '='
 * @returns {{state:object, error?:string}} error 存在时 state 原样返回（非法输入被忽略）
 */
export function calcKey(state, key) {
  const st = state || initialCalcState()
  const expr = st.expr || ''

  if (key === 'clear') {
    return { state: initialCalcState() }
  }

  if (key === 'del') {
    if (st.justEvaluated) {
      // 结果态下退格 = 清掉结果，回到 0（避免出现 "8" 删成 "" 的怪异中间态）
      return { state: initialCalcState() }
    }
    if (!expr) return { state: st }
    return { state: Object.assign({}, st, { expr: expr.slice(0, -1) }) }
  }

  if (key === '=') {
    return calcEquals(st)
  }

  const isDigit = key >= '0' && key <= '9'
  const isOp = OPS.indexOf(key) !== -1
  // 刚算出结果后：按运算符 → 结果成为左操作数（5 + 4）；按数字 → 重新开始（输 9 就是 9）
  const resultBase = st.justEvaluated ? (compactNumberString(st.lastResultCents) || '') : ''

  // 运算符（与数字分支平级，不能嵌在数字分支里 —— 嵌进去等于运算符永远被忽略）
  if (isOp) {
    const base = st.justEvaluated ? resultBase : expr
    if (!base) return { state: st } // 空表达式按运算符：忽略
    if (endsWithOperator(base)) {
      // 末尾已有运算符：替换它（用户改主意了），而不是拼出 "3++5"
      return { state: Object.assign({}, st, { expr: base.slice(0, -1) + key, justEvaluated: false }) }
    }
    return { state: Object.assign({}, st, { expr: base + key, justEvaluated: false }) }
  }

  if (isDigit || key === '.') {
    const base = st.justEvaluated ? '' : expr
    let cur = currentOperand(base)
    if (key === '.') {
      if (cur.indexOf('.') !== -1) return { state: st } // 已有小数点
      const next = cur === '' ? '0.' : cur + '.'
      return { state: Object.assign({}, st, { expr: base.slice(0, base.length - cur.length) + next, justEvaluated: false }) }
    }
    const parts = cur.split('.')
    if (parts.length === 2 && parts[1].length >= 2) return { state: st } // 小数最多 2 位
    const intDigits = (parts[0] || '').replace(/^0+/, '').length
    if (parts.length === 1 && intDigits >= MAX_INT_DIGITS) return { state: st } // 整数最多 9 位
    const next = cur + key
    return { state: Object.assign({}, st, { expr: base.slice(0, base.length - cur.length) + next, justEvaluated: false }) }
  }

  return { state: st }
}

/**
 * 按等号。
 * - 算式完整 → 算出结果，记下 lastOp/lastOperand 供重复等号使用
 * - 刚算完又按 = → 用上一次的运算符与操作数重复运算（3+5= → 8 → 13 → 18）
 * - 算式不完整（末尾是运算符 / 只有一个数）→ 返回 error，state 不变
 */
export function calcEquals(state) {
  const st = state || initialCalcState()
  const expr = st.expr || ''

  // 重复等号：用 lastOp 重放
  if (st.justEvaluated && st.lastOp) {
    const left = st.lastResultCents
    const right = st.lastOperand
    const one = evalExpression(
      compactNumberString(left) + st.lastOp + compactNumberString(right)
    )
    if (!one.ok) return { state: st, error: one.error }
    return { state: finished(one.cents, st.lastOp, right), }
  }

  // 没有运算符（或末尾就是运算符）时等号不可用 —— 与 canEquals 同一把尺子，
  // 避免"界面置灰但直接调用却算得出"这种两条路径判断不一致的情况
  if (!expr || !canEquals(st)) return { state: st, error: 'incomplete' }
  const r = evalExpression(expr)
  if (!r.ok) return { state: st, error: r.error }

  // 记下"最后一步的运算符与右操作数"，供重复等号
  const lastOp = expr.length ? expr.charAt(lastOpIndex(expr)) : ''
  const operandStr = lastOp ? normalizeOperand(currentOperand(expr.slice(lastOpIndex(expr) + 1))) : null
  const lastOperand = operandStr ? toCents(operandStr) : null
  return { state: finished(r.cents, lastOp, lastOperand) }
}

/** 表达式里最后一个运算符的下标（没有则 -1） */
function lastOpIndex(expr) {
  for (let i = expr.length - 1; i >= 0; i -= 1) {
    if (OPS.indexOf(expr.charAt(i)) !== -1) return i
  }
  return -1
}

function finished(cents, lastOp, lastOperand) {
  return {
    expr: compactNumberString(cents) || '0',
    lastResultCents: cents,
    lastOp: lastOp || '',
    lastOperand: lastOperand === null || lastOperand === undefined ? null : lastOperand,
    justEvaluated: true
  }
}

/** 千分位分组（与 utils/money.js 的 groupThousands 同算法，手写不依赖 Intl —— 真机上没有） */
function group(intStr) {
  let out = ''
  for (let i = 0; i < intStr.length; i += 1) {
    if (i > 0 && (intStr.length - i) % 3 === 0) out += ','
    out += intStr.charAt(i)
  }
  return out
}

/**
 * 顶部展示文本（页面唯一展示入口，三种形态）：
 * - 空 → '0.00'（与原型图一致）
 * - 算式中 → 表达式原样（用户要看得见自己按了什么）
 * - 已算出结果 → 金额（千分位 + 两位小数）
 * - 纯数字输入中 → 千分位整数 + 已输入的小数（不补小数位：输入 '19.9' 就显示 '19.9'，与原行为一致）
 */
export function calcDisplay(state) {
  const st = state || initialCalcState()
  const expr = st.expr || ''
  if (!expr) return '0.00'
  if (st.justEvaluated) return centsToDisplay(st.lastResultCents) || '0.00'
  // 只要表达式里有运算符就原样显示（含末尾是运算符的未完成态）：
  // 早先用 canEquals 判断，输入 '7+' 时会掉进数字分支显示成 0.00 —— 用户刚按的 7 和 + 凭空消失
  if (containsOperator(expr)) return expr
  const cur = currentOperand(expr)
  if (!cur) return '0.00'
  const s = normalizeOperand(cur)
  if (s === null) return '0.00'
  const parts = s.split('.')
  return group(parts[0]) + (parts.length === 2 ? '.' + parts[1] : '')
}

/** 错误码 → 用户能看懂的一句话（页面直接用，避免各处自己拼） */
export function calcErrorText(code) {
  if (code === 'div-by-zero') return '除数不能为 0 哦'
  if (code === 'overflow') return '金额太大啦，算不过来'
  if (code === 'bad-char') return '算式里有看不懂的符号'
  return '算式还没写完'
}
