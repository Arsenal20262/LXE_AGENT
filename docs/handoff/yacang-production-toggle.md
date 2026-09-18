# 雅仓生产开关交接

- 当前分支/Pool：`feature/new-yacang-module` / `pool-3`
- 完成内容：在桌面设置的“业务集成 → 雅仓”中增加“允许雅仓生产请求”复选框，默认关闭；开关状态随雅仓账号配置保存。
- 调用链：Dashboard 雅仓设置页 → `DesktopSetupInput.yacang.production_enabled` → `DesktopSetupService` 配置仓库 → `LXE_YACANG_PROD_ENABLED` → `YacangProductionGuard`。
- 修改文件：`apps/dashboard/src/desktop/shell.tsx`、`settings-model.ts`、`shared/i18n.tsx`、`styles.css`；`apps/desktop/src/main/config-store/{model,setup}.ts`、`ipc-validation.ts`、`yacang-test-page.ts`；`packages/foundation/desktop-protocol/src/index.ts`；相关桌面配置测试。
- 环境变量：运行时由配置生成 `LXE_YACANG_PROD_ENABLED=true/false`，不需要用户手动编辑环境变量；账号和密码仍走现有安全存储。
- 验证结果：定向 Bun 测试 49 个通过；`bun run typecheck` 通过；Dashboard `tsc -b && vite build` 通过；`git diff --check` 通过。
- 已知限制：未配置完整雅仓账号和密码时，生产复选框不可勾选；本次没有执行真实雅仓登录或生产导出。
- 下一步：在本地桌面页面确认开关显示、保存和重启后状态恢复；完成后将该分支合并到集成分支。
