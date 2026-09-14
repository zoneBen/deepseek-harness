/**
 * 授权码工具插件：把 {@link computeAuthCode} 接到 harness 的工具注册表上。
 *
 * 三个参数（机器码、编号、项目名称）由模型按本文件的 `parameters` 声明从用户消息中抽取；
 * `defineTool` 在 `execute` 运行前校验模型给出的 arguments。
 * @module scratch-plugin/tool-auth-code
 */

import type { Context } from '@deepseek-ai/cordis'
import { defineTool } from '@deepseek-ai/dsh-tools'
import { computeAuthCode } from './auth-code.ts'

export const name = 'tool-auth-code'
export const inject = ['tools']

/**
 * 注册 `get_auth_code` 工具。
 * @param ctx - 携带工具注册表的注册方上下文。
 */
export function apply(ctx: Context): void {
  ctx.tools.register(defineTool({
    name: 'get_auth_code',
    description:
      '根据机器码、编号、项目名称生成授权码。当用户要求「获取授权码」并给出这三项信息时调用。'
      + '三个参数都必须从用户消息中取得，缺失时先向用户询问，不要编造。',
    parameters: {
      machineCode: {
        type: 'string',
        required: true,
        description: '机器码，通常是用户消息中的长串字母数字标识。',
      },
      serial: {
        type: 'string',
        required: true,
        description: '编号，通常是纯数字串。用字符串而非整数，以避免丢失前导零。',
      },
      projectName: {
        type: 'string',
        required: true,
        description: '项目名称。',
      },
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          authCode: { type: 'string', required: true },
          machineCode: { type: 'string', required: true },
          projectName: { type: 'string', required: true },
        },
      },
      render: (_args, value) => [{
        type: 'text',
        text: `授权码: ${value.authCode}（机器码 ${value.machineCode}，项目 ${value.projectName}）`,
      }],
    },
    execute(args, exec) {
      // schema DSL 已保证三个键存在且为 string；它表达不了的约束在这里手动检查。
      const machineCode = args.machineCode.trim()
      const serial = args.serial.trim()
      const projectName = args.projectName.trim()
      if (machineCode === '' || serial === '' || projectName === '') {
        throw new Error('machineCode、serial、projectName 都不能是空白字符串')
      }
      if (!/^\d+$/.test(serial)) {
        throw new Error(`serial 必须是纯数字，收到 ${JSON.stringify(serial)}`)
      }
      // 信号触发时放弃尚未完成的工作；接远端授权服务后把它透传给 fetch。
      exec.signal.throwIfAborted()
      return Promise.resolve({
        authCode: computeAuthCode({ machineCode, serial, projectName }),
        machineCode,
        projectName,
      })
    },
    // 展示器是纯函数：实时流式与会话日志回放时都会运行，不做 I/O、不读时钟。
    presentCall: args => ({
      card: 'generic',
      title: `获取授权码 · ${args.projectName}`,
      kind: 'other',
      rawInput: args,
    }),
  }))
}
