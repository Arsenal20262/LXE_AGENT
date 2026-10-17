# LLM 适配

Provider 层把 Runtime 的统一消息转换成供应商请求，再把流式响应转成统一模型消息。当前支持三类协议，由 [provider-factory.ts](/packages/agent/runtime/src/providers/provider-factory.ts) 根据目录中的 apiStyle 选择：

| 协议 | 适配器 |
| --- | --- |
| Anthropic Messages | [provider.ts](/packages/agent/runtime/src/providers/provider.ts) 中的 AnthropicRuntimeProvider |
| OpenAI Chat Completions | [completions-provider.ts](/packages/agent/runtime/src/providers/completions-provider.ts) |
| OpenAI Responses | [responses-provider.ts](/packages/agent/runtime/src/providers/responses-provider.ts) |

## 职责与请求流程

1. 回合开始时获取 provider/model 与凭据快照；配置更新影响后续回合。
2. ContextPipeline 生成 canonical history 和本 step 可见工具，估算上下文预算。
3. 所选适配器转换消息、工具 schema、图片和推理控制，并按来源限制不透明字段的重放。
4. 发起对应协议的流请求，归一化文本、思考、工具参数、usage 和结束状态。
5. Runtime 根据完整响应执行工具、返回答案、重试或进入上下文溢出恢复。

Provider 不执行工具，不持有会话数据库，也不决定桌面或飞书的最终发送位置。请求适配不改写持久化 transcript。

## DeepSeek 图片请求

仅 `deepseek`、Responses 协议且支持视觉的路线启用 Files API。图片仍按现有规则预处理；发送前把历史图片逐张上传为 `purpose=user_data`，模型请求中改用 `input_image.file_id`。因此从其他供应商切换过来时，即使 Base64 历史超过 50 MB，也先上传、替换引用，再发送模型请求。

- 运行时共享 `<dataRoot>/cache/deepseek-files.json`，按接口地址、有效认证头的哈希和实际图片字节/MIME 的哈希隔离。索引不保存明文凭证和图片 Base64。文件锁与原子替换保护并发更新；损坏的索引记录实际错误后重建。
- 远端文件有效期为 7 天，剩余不足 1 小时不再复用。写入时清理过期及临近过期映射；服务端明确拒绝旧 `file_id` 时按实际使用的映射失效，最多重传并重试一次。不会因配额不足主动删除远端文件。
- 文件模式限制为 128 MiB 图片原始字节、600 次图片出现；Files 失败后整次请求回退到 Base64，总量限制为 20 MiB。超预算从最旧图片开始省略，按 64 MiB / 10 MiB / 20 张批量释放空间。同一图片重复出现时，上传可复用，预算逐次计入。
- 省略只作用于当前 DeepSeek 请求，切换供应商不继承它。需要恢复路径时，把准确的历史图片副本原子保存到 `<dataRoot>/cache/deepseek-images/`；不依赖可能已覆盖的截图原路径。恢复副本不随远端 `file_id` 过期而删除，可手动清理缓存；transcript 中的原图仍在。
- 最终按 UTF-8 JSON 校验完整请求体的 48 MiB 上限。文字和工具历史本身过大时明确失败；413 不作为 token 上下文溢出或普通可重试错误。上传有独立 60 秒期限，模型空闲超时从上传结束后开始。

transcript 继续保存原始 Base64，保持历史回放和跨供应商兼容；此优化减少网络请求体，不缩小 transcript。图片省略后的 usage 不用于校准完整共享历史的 token 估算。旧文件重试有独立的物理请求 trace，原始失败诊断保留并按日志规则脱敏。

## 专题

- [Provider Catalog](provider_catalog.md)：模型目录、能力、凭据和公司模型选择。
- [云端模型描述 v3](managed-model-catalog.md)：动态模型定义、客户端校验和发布兼容。
- [Streaming Adapter](streaming_adapter.md)：协议事件归一化、取消、超时与错误。
- [统一模型消息流](../assistant-message-stream.md)：三类协议共享的内容与事件契约。
- [Runtime Context](../runtime/context/README.md)：模型历史、预算与压缩。
- [Tool Schema](../runtime/tools/tool_schema.md)：工具定义和暴露范围。

## 排障

先区分配置错误、请求格式不支持、传输失败、上下文溢出和工具历史不闭合。错误保留脱敏、显式截断后的实际诊断；不要把所有失败归结为网络或权限问题。认证信息及不透明推理数据不得原样进入日志，具体日志边界见 [Logging](../logger.md)。
