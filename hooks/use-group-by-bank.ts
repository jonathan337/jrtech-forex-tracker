'use client'

import { useCallback, useEffect, useState } from 'react'
import {
  getGroupByBankPreference,
  setGroupByBankPreference,
} from '@/lib/group-by-bank-preference'

export function useGroupByBank() {
  const [groupByBank, setState] = useState(false)

  useEffect(() => {
    setState(getGroupByBankPreference())
  }, [])

  const setGroupByBank = useCallback((value: boolean) => {
    setGroupByBankPreference(value)
    setState(value)
  }, [])

  return [groupByBank, setGroupByBank] as const
}
