# Current Skill Catalog

This page is a navigation inventory, not a second source of runtime prompt truth. The authoritative content remains each repository `skills/*/SKILL.md`; discovery behavior is implemented in `packages/agent/runtime/src/tooling/skills.ts`.

## Inventory

The repository currently contains 31 top-level workflow and default runtime skills:

| Type | Count | Purpose |
| --- | ---: | --- |
| `amazon_fba` | 14 | shipment, customs, purchase, contract, and export-tax workflows |
| `replenishment` | 11 | inventory snapshots, sales analysis, parameters, replenishment calculation, and Wisdom login/export |
| `amazon_operations` | 2 | listing, keyword, competitor, and public-review analysis |
| `default` | 3 | general connector, workbook and custom Skill creation capabilities |
| `ziniao_browser` | 1 | controlled Ziniao browser lifecycle and page operations |

Counts describe top-level repository skills before per-agent permission and connector filtering. The
bundled Lark CLI contributes another 27 nested connector-specific Skill manifests, so recursive runtime
discovery sees 58 repository manifests in total.

## Amazon FBA

- `fba-workflow-map`
- `fba-shipment-create`
- `fba-shipment-delivery-csv-download`
- `fba-shipment-wms-box-download`
- `fba-erp-packing-upload`
- `fba-msku-detail-download`
- `fba-stock-sku-download`
- `fba-customs-declaration-fill`
- `fba-invoice-template-fill`
- `fba-purchase-summary-create`
- `fba-purchase-files-regenerate`
- `fba-restock-workbook-create`
- `fba-export-tax-products-manage`
- `fba-export-tax-delivery-summary`

Start with `fba-workflow-map` for routing. The individual skills own exact inputs, tool calls, output files, validation reports, and non-retry rules.

## Amazon Replenishment

- `replenishment-workflow-map`
- `replenishment-store-resolve`
- `replenishment-msku-download`
- `replenishment-unlinked-shipment-download`
- `replenishment-amazon-restock-inventory-snapshot`
- `replenishment-real-inventory-report`
- `replenishment-sales-analyze`
- `replenishment-algorithm-config-manage`
- `replenishment-calculate`

Start with `replenishment-workflow-map`. Snapshot and analysis skills prepare explicit artifacts; calculation consumes those artifacts and the selected algorithm configuration.

## 智慧登录与商品导出

- `shangman-login`（`replenishment` 权限）：通过真实验证码登录智慧，保存本地登录态，并支持状态查询与清除。由普通 Agent Loop 使用 `exec`、`read` 和已有问答工具编排，不执行商品导出。
- 在桌面“智慧”设置填写 ID、账号和密码。密码加密保存；Token 按马帮方式保存在应用状态目录，过期或凭据变更后重新登录。
- `status` 只检查本地状态，`clear` 只清除本地状态；两者都不代表平台在线验证或远程注销。
- `shangman-goods-export`（`replenishment` 权限）：调用 `lxeskill shangman export run`，复用现有登录态下载一份智慧印尼商品原始 XLSX；没有登录态时先完成登录再继续。库存和销量共用同一份原始商品报表，不新增筛选、历史数据或补货计算。
- 成功结果只交付校验后的原始文件；失败保留实际脱敏诊断，不自动重复提交导出。文件保存在注册的 `shangman/indonesia` 产物目录下，每次执行独立子目录。

## Amazon Operations

- `amazon-listing-optimizer`: Amazon.com listing analysis, autocomplete keyword research, and competitor discovery.
- `amazon-review-monitor`: one-shot Amazon.com review sampling with product-summary fallback and internal issue themes.

LXE formally maintains these modules' command and failure contracts. Their results come from Amazon public pages and an undocumented autocomplete endpoint, so agents must retain completeness and confidence diagnostics and must not describe the results as Amazon-authorized data. Review-page failures may preserve product-page rating aggregates as a partial result, but they must never be reported as evidence that a product has no reviews.

## Default Skills

- `dws`: DingTalk Workspace operations, subject to local connector visibility.
- `minimax-xlsx`: general workbook creation and transformation utilities.
- `skill-creator`: create or edit reusable user skills through conversation and existing file/exec tools.

## Ziniao Browser

- `ziniao-browser`: controlled store lifecycle, snapshots, navigation, and page interaction.

## Runtime Visibility

The visible catalog for one turn can be smaller than this page because runtime applies:

- server-verified device skill-type filtering;
- local connector enable/disable state;
- explicit disabled-skill configuration;
- catalog validation and duplicate rejection.

Dashboard skill APIs and the runtime prompt must use the same filtered catalog. A skill appearing in this repository inventory does not imply that every device can activate it.

## Keeping This Page Current

### UI 中文名

`config/skill-labels.json` 是本地与服务器前端共用的官方中文名源，首次覆盖本页的
FBA、备货、亚马逊运营和紫鸟 26 个技能。只用于 UI 展示，不参与 AI 提示词、命令或权限判断。
中文界面按英文 `name` 查名称；英文界面及未知技能保留原名。

新增上述类型的技能时追加中文名，删除技能时保留映射，让历史统计继续可读。
同一 `name` 始终代表同一技能；业务含义改变时使用新标识。更新中文名称会统一影响
新旧统计展示，不改变请求、统计分组或历史记录。已退役但尚未收录的标识显示英文。

服务器仓库使用 `uv run --frozen python scripts/import-skill-labels --agent-root <本仓库路径>`
生成发布快照，再用同一命令加 `--check` 检查并提交生成文件。不要手改服务器快照。
该检查会阻止缺少历史键的旧 checkout 覆盖已有映射。
两端独立发布，不要求客户端同时升级；服务器未更新的新技能暂时显示英文。

Update this page when a repository skill is added, removed, renamed, or changes type. Do not copy operational instructions, CLI schemas, selectors, or workbook column contracts here; link readers to the corresponding `skills/<name>/SKILL.md` instead.
