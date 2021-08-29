import { API } from 'homebridge'
import { ACCESSORY_NAME } from './constants'
import { YeelightScreenBarProAccessory } from './accessory'

export = (api: API) => {
  api.registerAccessory(
    ACCESSORY_NAME,
    YeelightScreenBarProAccessory as any,
  )
};
