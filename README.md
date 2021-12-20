# Homebridge Plugin for Yeelight Sreen Bar Pro

This plugin will help you connect your Yeelight Screen Bar Pro to Homebridge.

本插件可以将您的易来显示器挂灯 Pro 连接到 Homebridge。

Your screen bar should looks like this one:

你的挂灯应该看起来像这样：

![](https://img.alicdn.com/imgextra/https://img.alicdn.com/imgextra/i1/2738299213/O1CN01zWKhnw2Hvbctnxh1Z_!!2738299213.jpg)

## Usage 使用

First, install the plugin, you might need `sudo`:

首先，请安装本插件，你可能需要使用 `sudo`：

```shell
npm i -g Homebridge-new-widetech-internet-dehumidifier
```

Then head to Homebridge `config.json`, and add a new accessory:

然后在 Homebridge 的 `config.json` 中添加一个插件：

```json
{
  // ... extra configs

  "accessories": [
    // ... extra accessories

    {
      "accessory": "YeelightScreenBarPro",
      "ip": "10.0.1.5",
      "token": "the-top-secret-token"
    }
  ]
}
```

Now reboot Homebridge and turn to your Apple Home app.

重启 Homebridge 后，请前往 Apple Home app。

## Config 配置

Fields explained:

- `ip` (string, required): The IP address of the screen bar
- `token` (string, required): The miio token. In case you don't know what a token is, read [this](https://github.com/Maxmudjon/com.xiaomi-miio/blob/master/docs/obtain_token.md#obtain-mi-home-device-token)
- `pollingInterval` (number): How often to fetch status of the screen bar in milliseconds.
- `serial` (string): Serial Number field displayed in Home app. Will use the `token` field if absent
- `model` (string): Model field displayed in Home app
- `manufacturer`: Manufacturer field in Home app
- `smoothInterval` (number): The animation duration in milliseconds.
- `backgroundName` (string): Name for the second light bulb accessory to control ambient light.
- `backgroundColor` (boolean):
    - `true`: Map ambient light to a color light bulb. This lets you control the ambient color and brightness via Siri or Home app.
    - `false`: Map the ambient light to a switch-only bulb. You can choose the mode of ambient in MiHome app, lets you to use all of the advanced ambient modes.

配置字段如下：

- `ip` (必填): 屏幕挂灯的 IP 地址
- `token` (必填): miio 密钥。如果您不知道这是啥，请看[这里](https://github.com/Maxmudjon/com.xiaomi-miio/blob/master/docs/obtain_token.md#obtain-mi-home-device-token)
- `name`: 展示名称，用于在 HomeKit 中现实和打日志
- `serial`: Home app 中显示的序列号，如果为空，会使用上面的 `token` 字段
- `model`: Home app 中显示的型号
- `manufacturer`: Home app 中显示的制造商
- `smoothInterval` (number): 切换灯光状态时的动画间隔
- `backgroundName` (string): 背景灯的名称
- `backgroundColor` (boolean):
    - `true`: 将背景灯映射为一个彩色灯。此模式下你可以用 Siri 和 Home app 来控制背景灯的颜色和亮度
    - `false`: 将背景灯映射到一个只能切换开/关状态的灯。你需要在米家 app 中选择背景灯的模式。此模式下你可以使用各种高级的背景样式（比如跑马灯、流光等）

## Develop 本地开发

```shell
yarn
yarn watch
```
