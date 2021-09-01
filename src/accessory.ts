import { AccessoryPlugin, API, CharacteristicValue, Logging, Service as HomebridgeService } from 'homebridge'
import Color from 'color-js'

import { MiioDevice } from './miio-device'
import {
  DEFAULT_BACKGROUND_NAME,
  DEFAULT_DISPLAY_NAME,
  DEFAULT_MANUFACTURER,
  DEFAULT_MODEL,
  DEFAULT_POLLING_INTERVAL,
  DEFAULT_SMOOTH_INTERVAL,
} from './constants'
import { DehumidifierAccessoryConfig, MiioProps, SwitchStatuses } from './typings'
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

  private static readonly checkPowerOn = (_: any, status?: MiioProps) => status?.power === SwitchStatuses.On
  private static readonly checkBackgroundLightPowerOn = (_: any, status?: MiioProps) => status?.bg_power === SwitchStatuses.On

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
    const { Name, ColorTemperature } = Characteristic
    const { Lightbulb } = Service

    const service = new Lightbulb(displayName, 'main-light')
    service.setCharacteristic(Name, displayName || DEFAULT_DISPLAY_NAME)

    this.mapOnAndBrightness(
      service,
      'power',
      'bright',
      'set_power',
      'set_bright',
      'OnOff',
      'Brightness',
    )

    service.getCharacteristic(ColorTemperature)
      .on('set', this.device.mapSet(
        'setColorTemperature',
        'set_ct_abx',
        value => {
          const resultColorTemperature = normalizeToNewRange(value as any, [500, 140], [2700, 6500])
          return this.getSmoothedValue(resultColorTemperature)
        },
        { check: YeelightScreenBarProAccessory.checkPowerOn },
      ))
      .on('get', this.device.mapGet('getColorTemperature', result => normalizeToNewRange(+result.ct, [2700, 6500], [500, 140])))

    this.services.push(service)
  }

  private prepareBackgroundLightService() {
    const { backgroundName: displayName, backgroundColor } = this.config
    const { Service, Characteristic } = this.api.hap
    const { On, Name, Hue, Saturation } = Characteristic
    const { Lightbulb } = Service

    const service = new Lightbulb(displayName, 'background-light')
    service.setCharacteristic(Name, displayName || DEFAULT_BACKGROUND_NAME)

    if (backgroundColor ?? true) {
      this.mapOnAndBrightness(
        service,
        'bg_power',
        'bg_bright',
        'bg_set_power',
        'bg_set_bright',
        'BgOnOff',
        'BgBrightness',
      )

      service.getCharacteristic(Hue)
        .on('set', this.device.mapSet(
          'setHue',
          'bg_set_rgb',
          (_value) => {
            const value = _value as number
            this.lastHue = value
            return hueSaturationToColorRepresentative(value, this.lastSaturation)
          },
          { check: YeelightScreenBarProAccessory.checkBackgroundLightPowerOn },
        ))
        .on('get', this.device.mapGet('getHue', result => {
          const currentColor = Color(colorRepresentativeToRgb(result?.bg_rgb) as any)
          this.lastHue = currentColor.getHue()
          return this.lastHue
        }))

      service.getCharacteristic(Saturation)
        .on('set', this.device.mapSet(
          'setSaturation',
          'bg_set_rgb',
          (_value) => {
            const value = _value as number
            this.lastSaturation = value
            return hueSaturationToColorRepresentative(this.lastSaturation, value)
          },
          { check: YeelightScreenBarProAccessory.checkBackgroundLightPowerOn },
        ))
        .on('get', this.device.mapGet('getSaturation', result => {
          const currentColor = Color(colorRepresentativeToRgb(result?.bg_rgb) as any)
          this.lastSaturation = currentColor.getSaturation() * 100
          return this.lastSaturation
        }))
    } else {
      service.getCharacteristic(On)
        .on('set', this.device.mapSet(
          'setBgOnOff',
          'bg_set_power',
          value => this.getSmoothedValue(value ? SwitchStatuses.On : SwitchStatuses.Off),
          { update: (_, transformed, status) => ({ ...status, bg_power: transformed[0] }) },
        ))
        .on('get', this.device.mapGet('getBgOnOff', result => result.bg_power === SwitchStatuses.On))
    }

    this.services.push(service)
  }

  private mapOnAndBrightness(
    service: HomebridgeService,
    onOffStatusKey: keyof MiioProps,
    brightnessStatusKey: keyof MiioProps,
    onOffApi: string,
    brightnessApi: string,
    onOffName: string,
    brightnessName: string,
  ) {
    const { On, Brightness } = this.api.hap.Characteristic

    const setPower = this.device.mapSet(
      `set${onOffName}`,
      onOffApi,
      value => this.getSmoothedValue(value ? SwitchStatuses.On : SwitchStatuses.Off),
      { update: (_, transformed, status) => ({ ...status, [onOffStatusKey]: transformed[0] }) },
    )
    service.getCharacteristic(On)
      .on('set', setPower)
      .on('get', this.device.mapGet(`get${onOffName}`, result => result[onOffStatusKey] === SwitchStatuses.On))

    const setBrightness = this.device.mapSet(
      `set${brightnessName}`,
      brightnessApi,
      value => this.getSmoothedValue(value),
      { check: YeelightScreenBarProAccessory.checkPowerOn },
    )
    service.getCharacteristic(Brightness)
      // eslint-disable-next-line consistent-return
      .on('set', (value, cb) => {
        if (value === 0) return setPower(false, cb)
        setBrightness(value, cb)
      })
      .on('get', this.device.mapGet(`get${brightnessName}`, result => {
        if (result[onOffStatusKey] !== SwitchStatuses.On) return 0
        return +result[brightnessStatusKey]
      }))
  }

  private getSmoothedValue = (value: CharacteristicValue) => {
    const { smoothInterval = DEFAULT_SMOOTH_INTERVAL } = this.config
    return [value, 'smooth', smoothInterval]
  }
}
