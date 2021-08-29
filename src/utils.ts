import Color from 'color-js'

export const normalize = (value: number, min: number, max: number) => {
  if (value >= max) {
    return max
  }

  if (value <= min) {
    return min
  }

  return value
}

export const sleep = (delay: number) => new Promise(res => {
  setTimeout(res, delay)
})

export const colorRepresentativeToRgb = (color = '0') => {
  let x = +color
  const b = x % 256
  x = Math.floor(x / 256)
  const g = x % 256
  x = Math.floor(x / 256)
  const r = x % 256
  x = Math.floor(x / 256)
  return [r, g, b]
}

export const hueSaturationToColorRepresentative = (hue: number, saturation: number) => {
  const currentColor = Color({ hue, saturation: saturation / 100, value: 1 })
  const { red, green, blue } = currentColor.toRGB() as any

  const r = normalize(Math.round(red * 256), 0, 255)
  const g = normalize(Math.round(green * 256), 0, 255)
  const b = normalize(Math.round(blue * 256), 0, 255)

  return r * 256 * 256 + g * 256 + b
}

export type Range = [number, number]

export const normalizeToNewRange = (value: number, [oldFrom, oldTo]: Range, [newFrom, newTo]: Range, intFlag = true) => {
  const percentage = (value - oldFrom) / (oldTo - oldFrom)
  let result = percentage * (newTo - newFrom) + newFrom

  if (intFlag) {
    result = Math.round(result)
  }

  if (newFrom < newTo) {
    return normalize(result, newFrom, newTo)
  }
  return normalize(result, newTo, newFrom)
}
