export interface Bar {
  /** 'YYYY-MM-DD'(日线;周/月线为该周期起始日) */
  datetime: string
  open: number
  high: number
  low: number
  close: number
  volume: number | null
}

export type Interval = '1day' | '1week' | '1month'
