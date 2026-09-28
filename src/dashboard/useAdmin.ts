import { useCallback, useState } from 'react'
import { verifyAdminToken } from './persistence'

const TOKEN_KEY = 'financebuddy:admin-token:v1' // sessionStorage:会话级,关标签页即失效

/**
 * Admin 会话(ADR-0003):口令经服务端验证后存 sessionStorage;
 * 发布/恢复等写操作每次仍带凭证由服务端逐次校验,不依赖前端状态。
 */
export function useAdmin() {
  const [token, setToken] = useState<string | null>(() => {
    try {
      return sessionStorage.getItem(TOKEN_KEY)
    } catch {
      return null
    }
  })

  const enter = useCallback(async (password: string): Promise<boolean> => {
    const ok = password ? await verifyAdminToken(password) : false
    if (ok) {
      try {
        sessionStorage.setItem(TOKEN_KEY, password)
      } catch {
        // 存不了(隐私模式):本次会话内存态仍可用
      }
      setToken(password)
    }
    return ok
  }, [])

  const exit = useCallback(() => {
    try {
      sessionStorage.removeItem(TOKEN_KEY)
    } catch {
      // 同上
    }
    setToken(null)
  }, [])

  return { adminToken: token, isAdmin: token !== null, enter, exit }
}
