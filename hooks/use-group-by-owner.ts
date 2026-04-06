'use client'

import { useCallback, useEffect, useState } from 'react'
import {
  getGroupByOwnerPreference,
  setGroupByOwnerPreference,
} from '@/lib/group-by-owner-preference'

export function useGroupByOwner() {
  const [groupByOwner, setState] = useState(true)

  useEffect(() => {
    setState(getGroupByOwnerPreference())
  }, [])

  const setGroupByOwner = useCallback((value: boolean) => {
    setGroupByOwnerPreference(value)
    setState(value)
  }, [])

  return [groupByOwner, setGroupByOwner] as const
}
