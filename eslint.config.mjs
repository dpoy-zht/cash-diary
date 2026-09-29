/**
 * ESLint flat config（T1.4）。
 *
 * 目标是"lint 可用 + 挡住真实错误"，不是重立代码风格 —— 存量代码（无分号、
 * 4 空格缩进、function(){} 风格）不因 lint 改格式，所以不开风格类规则集。
 *
 * - vue 文件：eslint-plugin-vue flat/essential（只挡正确性问题）+ 少量 recommended 级规则
 * - uni-app 全局（uni / plus / plus.io 等）在 languageOptions.globals 声明，避免 no-undef 误报
 * - .vue 用 <script setup>，页面文件名（me/add/home…）是路由约定，关掉多词组件名检查
 */
import eslint from '@eslint/js'
import pluginVue from 'eslint-plugin-vue'

export default [
  {
    ignores: ['dist/**', 'node_modules/**', 'unpackage/**', 'demo/**', '.workbuddy/**']
  },
  // 核心正确性规则（no-undef / no-unused-vars 等），JS 与 .vue 的 <script> 都生效
  eslint.configs.recommended,
  ...pluginVue.configs['flat/essential'].map(function (c) {
    return { ...c, files: ['**/*.vue'] }
  }),
  {
    files: ['**/*.vue', '**/*.js'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: {
        // uni-app 运行时全局
        uni: 'readonly',
        plus: 'readonly',
        getCurrentPages: 'readonly',
        getApp: 'readonly',
        // 浏览器 / H5 端
        window: 'readonly',
        document: 'readonly',
        localStorage: 'readonly',
        navigator: 'readonly',
        URL: 'readonly',
        Blob: 'readonly',
        FileReader: 'readonly',
        TextEncoder: 'readonly',
        CSS: 'readonly',
        console: 'readonly',
        setTimeout: 'readonly',
        clearTimeout: 'readonly',
        Date: 'readonly',
        Map: 'readonly'
      }
    },
    rules: {
      // uni-app 条件编译（// #ifdef H5 / // #endif）会让 ESLint 把
      // return 之后的另一个平台分支误判为"不可达代码"，纯平台差异噪音，关闭
      'no-unreachable': 'off',
      // 存量风格大量使用 catch (e) {} 占位与回调参数，未用的形参/捕获不挡
      'no-unused-vars': ['error', { args: 'none', caughtErrors: 'none' }],
      // 页面文件名由 pages.json 路由约定（me / add / home…），不要求多词
      'vue/multi-word-component-names': 'off',
      // 属性换行/顺序属于风格，存量代码不统一，不挡
      'vue/max-attributes-per-line': 'off',
      'vue/singleline-html-element-content-newline': 'off',
      'vue/html-self-closing': 'off',
      'vue/attributes-order': 'off',
      'vue/html-indent': 'off',
      'vue/html-closing-bracket-newline': 'off',
      'vue/first-attribute-linebreak': 'off',
      'vue/block-order': 'off'
    }
  }
]
