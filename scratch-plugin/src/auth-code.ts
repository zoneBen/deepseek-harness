/**
 * 授权码计算。纯函数模块：不依赖 Cordis 上下文，可脱离 harness 独立单测。
 * @module scratch-plugin/auth-code
 */

/** 一次授权码计算请求。三个字段都已完成修剪与校验。 */
export interface AuthCodeRequest {
  /** 机器码，例如 `xxxxxxxxxxxx`。 */
  readonly machineCode: string
  /** 编号（纯数字），例如 `352822`。保持字符串类型以避免丢失前导零。 */
  readonly serial: string
  /** 项目名称，例如 `测试项目`。 */
  readonly projectName: string
}

/**
 * 由机器码、编号、项目名称计算授权码。
 * @param request - 三个已修剪、已校验的输入字段。
 * @returns 授权码字符串。
 */
export function computeAuthCode(request: AuthCodeRequest): string {
  const { machineCode, serial, projectName } = request
  // TODO: 替换为你的真实算法（查表 / 签名 / 请求远端授权服务）。
  // 注意：密钥、服务地址、超时一律走 Config 或环境变量，不要硬编码在这里。
  return `AUTH-${machineCode.slice(-4)}-${serial}-${projectName.length}`
}
