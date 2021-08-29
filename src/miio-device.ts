import { CharacteristicGetCallback, HAPStatus, CharacteristicValue, CharacteristicSetCallback, Logger } from 'homebridge'
import { debounce } from 'lodash'
import miio from 'miio'
import { IMapSetOptions } from './typings'
import { sleep } from './utils'

/**
 * Helper class to auto generate connector methods between Homebrdige and Miio.
 */
export class MiioDevice<TStatus> {
  private static createdDevices: Record<string, MiioDevice<any>> = {};

  static getDevice<T>(
    ip: string,
    token: string,
    logger: Pick<Logger, 'debug'|'error'>,
    pullingInterval: number,
    keys: Array<keyof T>,
  ): MiioDevice<T> {
    if (typeof this.createdDevices[token] === 'undefined') {
      this.createdDevices[token] = new MiioDevice(ip, token, logger, pullingInterval, keys)
    }

    return this.createdDevices[token]
  }

  private connection: miio.Device|undefined;
  private loadingLock = false;
  private status: TStatus|undefined;

  private handleSetPower?: (on: boolean) => Promise<any>;
  private handleGetPower?: (status?: TStatus) => boolean;

  private constructor(
    private readonly ip: string,
    private readonly token: string,
    private readonly logger: Pick<Logger, 'debug'|'error'>,
    private readonly pullingInterval: number,
    private readonly keys: Array<keyof TStatus>,
  ) {
    this.loop()
  }

  /**
   * Get miio connection. Will retry if failed.
   */
  private async getConnection(): Promise<miio.Device> {
    if (typeof this.connection === 'undefined') {
      try {
        this.connection = await miio.device({
          address: this.ip,
          token: this.token,
        })
      } catch (err) {
        this.logger.error('Failed to connect to device, will try again in 3000ms.')
        await sleep(3000)
        return this.getConnection()
      }
    }

    return this.connection
  }

  private async getData() {
    if (this.loadingLock) {
      return
    }
    this.loadingLock = true

    const status: TStatus = {} as any
    try {
      const connection = await this.getConnection()
      const data = await connection.call('get_prop', this.keys)
      this.keys.forEach((key, i) => {
        status[key] = data[i]
      })
      this.status = status
      this.logger.debug('Data fetched', data, status)
    } catch (err) {
      this.logger.error('Error occurred when fetching data:', err)
    }

    this.loadingLock = false
  }

  private loop = async () => {
    await this.getData()
    setTimeout(this.loop, this.pullingInterval)
  };

  /**
   * Some of the set action requires power to be on. So this hook.
   */
  registerPowerHooks(
    getHook: (status?: TStatus) => boolean,
    setHook: (on: boolean) => Promise<any>,
  ) {
    this.handleGetPower = getHook
    this.handleSetPower = setHook
  }

  /**
   * Map a miio action into a Homebridge get handler.
   *
   * @param actionName The name for debug logging.
   * @param props A list of props to be retrieved.
   * @param transformer Transform the return value of miio into CharacteristicValue.
   * @returns A function to be used as Homebridge get handler.
   */
  mapGet = (actionName: string, transformer: (status: TStatus) => CharacteristicValue) => (callback: CharacteristicGetCallback) => {
    if (!this.status) {
      callback(new Error('Data never fetched'))
      return
    }

    const transformed = transformer(this.status)
    this.logger.debug(`[${actionName}] status:`, this.status, 'transformed:', transformed)
    callback(HAPStatus.SUCCESS, transformed)
  };

  /**
   * Map a miio action into a Homebridge set handler.
   *
   * @param actionName The name for debug logging.
   * @param api The name of the miio API.
   * @param transformer Transform Homebridge CharacteristicValue into miio props.
   * @param options Additional configs.
   * @returns A function to be used as Homebridge set handler.
   */
  mapSet(
    actionName: string,
    api: string,
    transformer: (value: CharacteristicValue, status: TStatus|undefined) => any,
    options?: IMapSetOptions<TStatus>,
  ) {
    const { debounce: debounceTime, ensureActive, update } = options || {}

    const fn = async (value: CharacteristicValue, callback?: CharacteristicSetCallback): Promise<void> => {
      const transformed = transformer(value, this.status)
      this.logger.debug(`${actionName} to:`, value, 'transformed:', transformed)

      try {
        if (ensureActive && !this.handleGetPower?.(this.status)) {
          await this.handleSetPower?.(true)
        }

        const connection = await this.getConnection()
        const result = await connection.call(api, Array.isArray(transformed) ? transformed : [transformed])
        this.logger.debug(actionName, result)

        if (result[0] === 'ok') {
          callback?.(null)

          if (update && this.status) {
            this.status[update] = transformed as any
          }
        } else {
          callback?.(new Error(result[0]))
        }
      } catch (error) {
        this.logger.error(actionName, error)
        callback?.(error)
      }
    }

    if (typeof debounceTime === 'number') {
      return debounce(fn, debounceTime) as any as typeof fn
    }

    return fn
  }
}
