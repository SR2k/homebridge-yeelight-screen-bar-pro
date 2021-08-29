declare module 'miio' {
  class Device {
    call<TReturns extends any[] = any[], TProps extends any[] = any[]>(
      api: string,
      props: TProps,
    ): Promise<TReturns>;
  }

  export function device(configs: {
    address: string
    token: string
  }): Device;
}
