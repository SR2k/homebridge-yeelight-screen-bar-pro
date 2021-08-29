/* eslint-disable camelcase */

import { AccessoryConfig } from 'homebridge'

export interface IMapSetOptions<T> {
  debounce?: number
  ensureActive?: boolean
  update?: keyof T
}

export const enum SwitchStatuses {
  On = 'on',
  Off = 'off',
}

export interface DehumidifierAccessoryConfig extends AccessoryConfig {
  ip: string
  token: string
  pollingInterval?: number
  serial?: string
  model?: string
  manufacturer?: string
  smoothInterval?: number
  backgroundName?: string
}

export type NumberString = string

export interface MiioProps {
  power: SwitchStatuses
  bright: NumberString
  ct: NumberString
  color_mode: any // TODO
  bg_bright: NumberString
  bg_rgb: NumberString
  bg_hue: NumberString
  bg_sat: any // TODO
  bg_proact: SwitchStatuses
  main_power: SwitchStatuses
  bg_power: SwitchStatuses
  bg_lmode: any // TODO
  bg_ct: NumberString
}
