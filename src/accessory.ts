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
import { DehumidifierAccessoryConfig, IMapSetOptions, MiioProps, SwitchStatuses } from './typings'
import { colorRepresentativeToRgb, hueSaturationToColorRepresentative, normalizeToNewRange } from './utils'

const ALL_KEYS: Array<keyof MiioProps> = [
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
  'power',
]

export class YeelightScreenBarProAccessory implements AccessoryPlugin {
  private readonly services: HomebridgeService[] = [];
  private readonly device: MiioDevice<MiioProps>;

  private mainLightService: HomebridgeService|undefined;
  private backgroundLightService: HomebridgeService|undefined;

  private lastHue = 0;
  private lastSaturation = 0;

  private static readonly checkPowerOn = (_: any, status?: MiioProps) => status?.main_power === SwitchStatuses.On
  private static readonly checkBackgroundLightPowerOn = (_: any, status?: MiioProps) => status?.bg_power === SwitchStatuses.On

  constructor(
    private readonly log: Logging,
    private readonly config: DehumidifierAccessoryConfig,
    private readonly api: API,
  ) {
    this.config.backgroundColor = this.config.backgroundColor ?? true

    const { ip, token, pollingInterval } = this.config
    this.device = MiioDevice.getDevice(
      ip,
      token,
      this.log,
      pollingInterval || DEFAULT_POLLING_INTERVAL,
      ALL_KEYS,
      this.updateStates,
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
      'main_power',
      'bright',
      'set_power',
      'set_bright',
      'OnOff',
      'Brightness',
      YeelightScreenBarProAccessory.checkPowerOn,
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
    this.mainLightService = service
  }

  private prepareBackgroundLightService() {
    const { backgroundName: displayName, backgroundColor } = this.config
    const { Service, Characteristic } = this.api.hap
    const { On, Name, Hue, Saturation } = Characteristic
    const { Lightbulb } = Service

    const service = new Lightbulb(displayName, 'background-light')
    service.setCharacteristic(Name, displayName || DEFAULT_BACKGROUND_NAME)

    if (backgroundColor) {
      this.mapOnAndBrightness(
        service,
        'bg_power',
        'bg_bright',
        'bg_set_power',
        'bg_set_bright',
        'BgOnOff',
        'BgBrightness',
        YeelightScreenBarProAccessory.checkBackgroundLightPowerOn,
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
        .on('get', this.device.mapGet('getHue', status => this.hueGetterTransformer(status.bg_rgb)))

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
        .on('get', this.device.mapGet('getSaturation', (status) => this.saturationGetterTransformer(status.bg_rgb)))
    } else {
      service.getCharacteristic(On)
        .on('set', this.device.mapSet(
          'setBgOnOff',
          'bg_set_power',
          value => this.getSmoothedValue(value ? SwitchStatuses.On : SwitchStatuses.Off),
          { update: (_, transformed, status) => ({ ...status, bg_power: transformed[0] }) },
        ))
        .on('get', this.device.mapGet('getBgOnOff', result => this.powerGetterTransformer(result.bg_power)))
    }

    this.services.push(service)
    this.backgroundLightService = service
  }

  private mapOnAndBrightness(
    service: HomebridgeService,
    onOffStatusKey: keyof MiioProps,
    brightnessStatusKey: keyof MiioProps,
    onOffApi: string,
    brightnessApi: string,
    onOffName: string,
    brightnessName: string,
    checkPower: IMapSetOptions<MiioProps>['check'],
  ) {
    const { On, Brightness } = this.api.hap.Characteristic

    const setPower = this.device.mapSet(
      `set${onOffName}`,
      onOffApi,
      value => [value ? SwitchStatuses.On : SwitchStatuses.Off],
      {
        update: (_, transformed, status) => ({ ...status, [onOffStatusKey]: transformed[0] }),
        debounce: 150,
      },
    )
    service.getCharacteristic(On)
      .on('set', setPower)
      .on('get', this.device.mapGet(`get${onOffName}`, result => this.powerGetterTransformer(result[onOffStatusKey])))

    const setBrightness = this.device.mapSet(
      `set${brightnessName}`,
      brightnessApi,
      value => this.getSmoothedValue(value),
      { check: checkPower },
    )
    service.getCharacteristic(Brightness)
      .on('set', (value, cb) => {
        if (value === 0) return
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

  private readonly powerGetterTransformer = (p: MiioProps['main_power']|MiioProps['bg_power']) => p === SwitchStatuses.On
  private readonly brightnessGetterTransformer = (b: MiioProps['bright']|MiioProps['bg_bright']) => +b
  private readonly hueGetterTransformer = (r: MiioProps['bg_rgb']) => {
    const currentColor = Color(colorRepresentativeToRgb(r) as any)
    this.lastHue = currentColor.getHue()
    return this.lastHue
  }
  private readonly saturationGetterTransformer = (r: MiioProps['bg_rgb']) => {
    const currentColor = Color(colorRepresentativeToRgb(r) as any)
    this.lastSaturation = currentColor.getSaturation() * 100
    return this.lastSaturation
  }

  private updateStates = (changedState: Partial<MiioProps>) => {
    if (!this.mainLightService || !this.backgroundLightService || !changedState) return

    const { main_power: mainPower, bg_power: bgPower, bright, bg_bright: bgBright, bg_rgb: bgRgb } = changedState
    const { On, Brightness, Hue, Saturation } = this.api.hap.Characteristic

    if (typeof mainPower !== 'undefined') {
      this.mainLightService?.updateCharacteristic(On, this.powerGetterTransformer(mainPower))
    }
    if (typeof bright !== 'undefined') {
      this.mainLightService?.updateCharacteristic(Brightness, this.brightnessGetterTransformer(bright))
    }
    if (typeof bgPower !== 'undefined') {
      this.backgroundLightService?.updateCharacteristic(On, this.powerGetterTransformer(bgPower))
    }

    if (this.config.backgroundColor) {
      if (typeof bgBright !== 'undefined') {
        this.backgroundLightService?.updateCharacteristic(Brightness, this.brightnessGetterTransformer(bgBright))
      }
      if (typeof bgRgb !== 'undefined') {
        this.backgroundLightService?.updateCharacteristic(Hue, this.hueGetterTransformer(bgRgb))
        this.backgroundLightService?.updateCharacteristic(Saturation, this.saturationGetterTransformer(bgRgb))
      }
    }
  }
}
