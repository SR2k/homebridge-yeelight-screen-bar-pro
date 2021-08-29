import { AccessoryPlugin, API, CharacteristicValue, Logging, Service as HomebridgeService } from 'homebridge'
import Color from 'color-js'

import { MiioDevice } from './miio-device'
import {
  DEFAULT_BACKGROUND_NAME, DEFAULT_MANUFACTURER, DEFAULT_MODEL, DEFAULT_POLLING_INTERVAL,
  DEFAULT_DISPLAY_NAME, DEFAULT_SMOOTH_INTERVAL,
} from './constants'
import { MiioProps, DehumidifierAccessoryConfig, SwitchStatuses } from './typings'
import { colorRepresentativeToRgb, hueSaturationToColorRepresentative, normalizeToNewRange } from './utils'

const ALL_KEYS: Array<keyof MiioProps> = [
  'power',
  'bright',
  'ct',
  'color_mode',
  'bg_bright',
  'bg_rgb',
  'bg_hue',
  'bg_sat',
  'bg_proact',
  'main_power',
  'bg_power',
  'bg_lmode',
  'bg_ct',
]

export class YeelightScreenBarProAccessory implements AccessoryPlugin {
  private readonly services: HomebridgeService[] = [];
  private readonly device: MiioDevice<MiioProps>;

  private lastHue = 0;
  private lastSaturation = 0;

  constructor(
    private readonly log: Logging,
    private readonly config: DehumidifierAccessoryConfig,
    private readonly api: API,
  ) {
    const { ip, token, pollingInterval } = this.config
    this.device = MiioDevice.getDevice(
      ip,
      token,
      this.log,
      pollingInterval || DEFAULT_POLLING_INTERVAL,
      ALL_KEYS,
    )

    this.prepareAccessoryInformation()
    this.prepareMainLightService()
    this.prepareBackgroundLightService()
  }

  getServices() {
    return this.services
  }

  private prepareAccessoryInformation() {
    const { serial, model, token, manufacturer } = this.config

    const { Service, Characteristic } = this.api.hap
    const { Manufacturer, Model, SerialNumber } = Characteristic
    const accessoryInformationService = new Service.AccessoryInformation()

    accessoryInformationService
      .setCharacteristic(Manufacturer, manufacturer || DEFAULT_MANUFACTURER)
      .setCharacteristic(Model, model || DEFAULT_MODEL)
      .setCharacteristic(SerialNumber, serial || token.toUpperCase())

    this.services.push(accessoryInformationService)
  }

  private prepareMainLightService() {
    const { name: displayName } = this.config
    const { Service, Characteristic } = this.api.hap
    const { Name, Active, Brightness, ColorTemperature } = Characteristic
    const { Lightbulb } = Service

    const service = new Lightbulb(displayName, 'main-light')
    service.setCharacteristic(Name, displayName || DEFAULT_DISPLAY_NAME)

    const setPower = this.device.mapSet('setActive', 'set_power', value => this.getSmoothedValue(value ? SwitchStatuses.On : SwitchStatuses.Off))
    this.device.registerPowerHooks(s => s?.power === SwitchStatuses.On, setPower)
    service.getCharacteristic(Active)
      .on('set', setPower)
      .on('get', this.device.mapGet('getActive', result => result.power === SwitchStatuses.On))

    service.getCharacteristic(Brightness)
      .on('set', this.device.mapSet('setBrightness', 'set_bright', value => this.getSmoothedValue(value)))
      .on('get', this.device.mapGet('getBrightness', result => +result.bright))

    service.getCharacteristic(ColorTemperature)
      .on('set', this.device.mapSet('setColorTemperature', 'set_ct_abx', value => {
        const resultColorTemperature = normalizeToNewRange(value as any, [500, 140], [2700, 6500])
        return this.getSmoothedValue(resultColorTemperature)
      }))
      .on('get', this.device.mapGet('getColorTemperature', result => normalizeToNewRange(+result.ct, [2700, 6500], [500, 140])))

    this.services.push(service)
  }

  private prepareBackgroundLightService() {
    const { backgroundName: displayName } = this.config
    const { Service, Characteristic } = this.api.hap
    const { Name, Active, Brightness, Hue, Saturation } = Characteristic
    const { Lightbulb } = Service

    const service = new Lightbulb(displayName, 'background-light')
    service.setCharacteristic(Name, displayName || DEFAULT_BACKGROUND_NAME)

    service.getCharacteristic(Active)
      .on('set', this.device.mapSet('setActive', 'bg_set_power', value => this.getSmoothedValue(value ? SwitchStatuses.On : SwitchStatuses.Off)))
      .on('get', this.device.mapGet('getActive', result => result.power === SwitchStatuses.On))

    service.getCharacteristic(Brightness)
      .on('set', this.device.mapSet('setBrightness', 'bg_set_bright', value => this.getSmoothedValue(value)))
      .on('get', this.device.mapGet('getBrightness', result => +result.bg_bright))

    service.getCharacteristic(Hue)
      .on('set', this.device.mapSet('setHue', 'bg_set_rgb', (_value) => {
        const value = _value as number
        this.lastHue = value
        return hueSaturationToColorRepresentative(value, this.lastSaturation)
      }))
      .on('get', this.device.mapGet('getHue', result => {
        const currentColor = Color(colorRepresentativeToRgb(result?.bg_rgb) as any)
        this.lastHue = currentColor.getHue()
        return this.lastHue
      }))

    service.getCharacteristic(Saturation)
      .on('set', this.device.mapSet('setSaturation', 'bg_set_rgb', (_value) => {
        const value = _value as number
        this.lastSaturation = value
        return hueSaturationToColorRepresentative(this.lastSaturation, value)
      }))
      .on('get', this.device.mapGet('getSaturation', result => {
        const currentColor = Color(colorRepresentativeToRgb(result?.bg_rgb) as any)
        this.lastSaturation = currentColor.getSaturation() * 100
        return this.lastSaturation
      }))

    this.services.push(service)
  }

  private getSmoothedValue = (value: CharacteristicValue) => {
    const { smoothInterval = DEFAULT_SMOOTH_INTERVAL } = this.config
    return [value, 'smooth', smoothInterval]
  }
}
