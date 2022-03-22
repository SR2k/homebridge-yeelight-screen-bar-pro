/* eslint-disable camelcase */

import { AccessoryConfig, CharacteristicValue } from 'homebridge'

export interface IMapSetOptions<T> {
  debounce?: number
  update?: (value: CharacteristicValue, transformed: any, status: T) => T
  check?: (value: CharacteristicValue, status: T|undefined) => boolean | Promise<boolean>
  before?: (value: CharacteristicValue, status: T|undefined) => any
  after?: (value: CharacteristicValue, status: T|undefined) => any
}

export const enum SwitchStatuses {
  On = 'on',
  Off = 'off',
}

export interface ScreenBarAccessoryConfig extends AccessoryConfig {
  ip: string
  token: string
  pollingInterval?: number
  serial?: string
  model?: string
  manufacturer?: string
  smoothInterval?: number
  enableBackground?: boolean
  backgroundName?: string
  backgroundColor?: boolean
}

export type NumberString = string

export interface MiioProps {
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
  power: SwitchStatuses
}
