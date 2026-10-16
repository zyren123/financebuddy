export const springs = {
  feedback: { stiffness: 740, damping: 48 },
  selection: { stiffness: 560, damping: 43 },
  morph: { stiffness: 320, damping: 35 },
} satisfies Record<string, { stiffness: number; damping: number }>

export type SpringConfig = (typeof springs)[keyof typeof springs]

/** Unit-mass damped oscillator; substeps keep dropped frames stable. */
export function advanceSpring(position: number[], velocity: number[], target: readonly number[], dt: number, config: SpringConfig) {
  const steps = Math.max(1, Math.ceil(dt / (1 / 240)))
  const step = dt / steps
  let resting = true
  for (let n = 0; n < steps; n++) {
    for (let i = 0; i < target.length; i++) {
      velocity[i] += ((target[i] - position[i]) * config.stiffness - velocity[i] * config.damping) * step
      position[i] += velocity[i] * step
    }
  }
  for (let i = 0; i < target.length; i++) {
    if (Math.abs(position[i] - target[i]) > 0.0001 || Math.abs(velocity[i]) > 0.001) resting = false
  }
  return resting
}

/** Retarget without resetting velocity. Only active springs own an animation frame. */
export function createSpring(initial: readonly number[], paint: (value: readonly number[]) => void, config: SpringConfig = springs.morph) {
  let position = [...initial]
  let velocity = initial.map(() => 0)
  let target = [...initial]
  let frame = 0
  let last = 0
  const preference = matchMedia('(prefers-reduced-motion: reduce)')
  const settle = () => {
    cancelAnimationFrame(frame)
    frame = 0
    position = [...target]
    velocity.fill(0)
    paint(position)
  }
  const tick = (now: number) => {
    const resting = advanceSpring(position, velocity, target, Math.min((now - last) / 1000, 0.064), config)
    last = now
    paint(position)
    if (resting) settle()
    else frame = requestAnimationFrame(tick)
  }
  const onPreference = () => { if (preference.matches) settle() }
  const onVisibility = () => { if (document.hidden) settle() }
  preference.addEventListener('change', onPreference)
  document.addEventListener('visibilitychange', onVisibility)
  return {
    set(next: readonly number[]) {
      paint(position)
      if (next.length === target.length && next.every((v, i) => v === target[i])) return
      target = [...next]
      if (preference.matches || document.hidden) { settle(); return }
      if (!frame) {
        last = performance.now()
        frame = requestAnimationFrame(tick)
      }
    },
    stop() {
      cancelAnimationFrame(frame)
      preference.removeEventListener('change', onPreference)
      document.removeEventListener('visibilitychange', onVisibility)
    },
  }
}
