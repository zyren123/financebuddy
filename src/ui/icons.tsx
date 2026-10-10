import type { SVGProps } from 'react'

/** 站内图标:同一套 1.5 描边、14px 网格,随文字颜色 */
function Icon({ children, ...props }: SVGProps<SVGSVGElement>) {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 14 14"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      {...props}
    >
      {children}
    </svg>
  )
}

export const ArrowDownIcon = (p: SVGProps<SVGSVGElement>) => (
  <Icon {...p}>
    <path d="M7 2v10M3 8l4 4 4-4" />
  </Icon>
)

export const PencilIcon = (p: SVGProps<SVGSVGElement>) => (
  <Icon {...p}>
    <path d="M9.5 2.5l2 2L5 11H3V9l6.5-6.5z" />
  </Icon>
)

export const CheckIcon = (p: SVGProps<SVGSVGElement>) => (
  <Icon {...p}>
    <path d="M2.5 7.5l3 3 6-7" />
  </Icon>
)

export const PlusIcon = (p: SVGProps<SVGSVGElement>) => (
  <Icon {...p}>
    <path d="M7 2.5v9M2.5 7h9" />
  </Icon>
)

export const CloseIcon = (p: SVGProps<SVGSVGElement>) => (
  <Icon {...p}>
    <path d="M3 3l8 8M11 3l-8 8" />
  </Icon>
)

export const SlidersIcon = (p: SVGProps<SVGSVGElement>) => (
  <Icon {...p}>
    <path d="M2 4h6M11 4h1M2 10h1M6 10h6" />
    <circle cx="9.5" cy="4" r="1.5" />
    <circle cx="4.5" cy="10" r="1.5" />
  </Icon>
)
