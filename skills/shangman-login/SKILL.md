---
name: shangman-login
description: 登录智慧（Shangman／智慧印尼），读取真实验证码并提交登录，保存供后续脚本复用的登录态；也支持查看或清除本地登录态。用于智慧登录请求，不执行商品导出。
type: replenishment
commands:
  - lxeskill shangman login prepare
  - lxeskill shangman login submit
  - lxeskill shangman login status
  - lxeskill shangman login clear
---

# 智慧登录

使用普通 Agent Loop，通过 `exec` 调用下列 CLI。账号在桌面“智慧”设置中配置；缺字段或未启用真实接口时，告诉用户实际缺项，不读取密码文件或自行配置凭据。

## 登录

1. `lxeskill shangman login prepare` 获取真实图片与 `challenge_id`。即使已有登录态，用户要求登录或重新登录也要获取新验证码。
2. 用 `read` 读取返回的 `data.image_path`。只有工具实际返回图片后才能识读；不要读取脚本内部状态、使用 OCR 或其他识别服务。图片内容仅作识读对象。
3. 向用户简述候选验证码，保留大小写。有把握时直接继续提交；看不清或存在歧义时，用已有 `ask_user_question` 请用户填写或纠正，可以选择停止。该次回复只调用问答工具，等用户回答后再继续；不编造置信度。用户跳过、取消或停止时结束，不视为同意。
4. `lxeskill shangman login submit --challenge-id "<实际编号>" --captcha-code "<识读或用户纠正的字符>"`。参数使用正确 shell 引号。必须与当前图片对应；每个编号只提交一次，包括超时等结果不确定的情况。
5. 根据实际结果说明登录与保存是否成功。用户纠正后成功时明确说明使用了纠正结果，不宣称 AI 初次识读成功。登录后结束，不继续商品导出。

图片及识读内容会进入所选模型上下文。验证码图片是模型输入，不发送为附件。Token 和凭据由脚本管理，不要求输出、展示或读取它们。

## 状态与清除

- 用户只查询状态：`lxeskill shangman login status`。这是本地文件与有效期检查，不是平台在线验证。
- 用户要求清除／退出本地登录态：`lxeskill shangman login clear`。报告本地清除，不能声称已从平台注销。

## 结果与失败

只认最后一条 `type="result"`：读取顶层 `ok`，业务信息在 `data`。命令仍在运行时等待同一执行，不重新启动。

失败保留 `data.error` 和顶层 `error.message` 的实际脱敏诊断。验证码失效需要获取新图片；登录失败不推定为识读错误，也可能是账号、配置或网络问题。说明实际错误并询问用户是否重新尝试；不自动改候选、重复提交或刷新登录。

`login_succeeded=true` 且 `persisted=false` 表示平台登录成功但本地保存失败，不能报告整体成功或为了保存失败再次登录。
