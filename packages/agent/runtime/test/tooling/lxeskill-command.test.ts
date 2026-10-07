import { describe, expect, test } from "bun:test";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  loadLxeSkillCommandCatalog,
  loadLxeSkillDatasets,
  matchLxeSkillInvocation,
} from "../../src/tooling/lxeskill-command";
import { buildToolDisplayStep } from "../../src/tooling/tool-display";

describe("lxeskill command recognition", () => {
  test("matches only a leading known command and chooses the longest path", () => {
    const known = new Map([
      ["lxeskill replenish inventory actual-export", ["inventory"]],
      ["lxeskill replenish inventory", ["short"]],
    ]);

    expect(matchLxeSkillInvocation(
      "lxeskill replenish inventory actual-export --store-name Demo --token secret",
      known,
    )).toEqual({
      command: "lxeskill replenish inventory actual-export",
      commandId: "replenish inventory actual-export",
      ownerSkills: ["inventory"],
    });
    expect(matchLxeSkillInvocation("echo lxeskill replenish inventory actual-export", known)).toBeUndefined();
    expect(matchLxeSkillInvocation("lxeskill unknown command", known)).toBeUndefined();
  });

  test("renders an exec call as a business skill with its complete command", () => {
    const command = "lxeskill fba shipment prepare-upload --context-file secret.json --token raw-secret";
    const step = buildToolDisplayStep(
      "tool-1",
      "exec",
      { command },
      "running",
      0,
    );

    expect(step.title).toBe("业务技能：fba shipment prepare-upload");
    expect(step.detail).toBe(command);
  });

  test("loads the artifact dataset registry with module-partitioned directories", () => {
    const catalogPath = join(process.cwd(), "python", "lxeskill_cli", "lxeskill", "catalog.json");
    const datasets = loadLxeSkillDatasets(catalogPath);

    expect(datasets.length).toBeGreaterThan(0);
    expect(datasets.find((entry) => entry.id === "fba_delivery_csv")?.dir).toBe("fba/delivery_csv");
    // Every directory is owned by exactly one business module — the property the
    // <module>/<data-type> layout depends on.
    const modules = new Set(datasets.map((entry) => entry.dir.split("/")[0]));
    expect([...modules].sort()).toEqual(["amazon", "browser", "fba", "mabang", "mabang_tms", "replenish", "shangman", "vietnam", "yacang"]);
    expect(new Set(datasets.map((entry) => entry.dir)).size).toBe(datasets.length);
    expect(datasets.every((entry) => entry.holds.length > 0)).toBe(true);
  });

  test("loads stable commands, owners, modules, and artifact declarations", () => {
    const catalogPath = join(process.cwd(), "python", "lxeskill_cli", "lxeskill", "catalog.json");
    const entries = loadLxeSkillCommandCatalog(catalogPath);

    expect(entries.find((entry) => entry.name === "browser_auth_refresh")).toEqual({
      command: "lxeskill auth refresh",
      name: "browser_auth_refresh",
      visibility: "maintenance",
      ownerSkills: ["ziniao-browser"],
      attributionSkill: "ziniao-browser",
    });
    expect(entries.find((entry) => entry.name === "mabang_download_fba_delivery_csv"))
      .toMatchObject({
        command: "lxeskill fba shipment delivery-csv-download",
        module: "services.agent_cli.mabang.download_fba_delivery_csv",
        ownerSkills: ["fba-shipment-delivery-csv-download"],
        attributionSkill: "fba-shipment-delivery-csv-download",
      });
    expect(entries.find((entry) => entry.name === "mabang_regenerate_purchase_files"))
      .toMatchObject({
        command: "lxeskill fba purchase files-regenerate",
        module: "services.agent_cli.mabang.regenerate_purchase_files",
        ownerSkills: ["fba-purchase-files-regenerate"],
        attributionSkill: "fba-purchase-files-regenerate",
        artifactPaths: [
          { field: "purchase_summary_xlsx", role: "deliverable" },
          { field: "restock_xlsx_paths[]", role: "deliverable" },
          { field: "contract_xlsx_paths[]", role: "deliverable" },
        ],
      });
    expect(entries.find((entry) => entry.name === "ziniao_page")).toMatchObject({
      ownerSkills: ["ziniao-browser"],
      artifactPaths: [{ field: "screenshot_path", role: "model_input" }],
      attributionSkill: "ziniao-browser",
    });
    expect(entries.find((entry) => entry.name === "mabang_resolve_fba_store"))
      .toMatchObject({
        attributionSkill: "replenishment-store-resolve",
        ownerSkills: expect.arrayContaining([
          "replenishment-store-resolve",
          "replenishment-unlinked-shipment-download",
        ]),
      });
  });
});

test("Shangman login commands belong to the login skill and expose only the captcha as model input", () => {
  const entries = loadLxeSkillCommandCatalog(join(process.cwd(), "python/lxeskill_cli/lxeskill/catalog.json"));
  const commands = entries.filter(entry => entry.name.startsWith("shangman_login_"));
  expect(commands).toHaveLength(4);
  for (const entry of commands) expect(entry.ownerSkills).toEqual(["shangman-login"]);
  expect(commands.find(entry => entry.name === "shangman_login_prepare")?.artifactPaths).toEqual([{ field: "image_path", role: "model_input" }]);
});

test("Shangman export is a separate command delivering one workbook", () => {
  const path = join(process.cwd(), "python/lxeskill_cli/lxeskill/catalog.json");
  const entries = loadLxeSkillCommandCatalog(path);
  const entry = entries.find(entry => entry.name === "shangman_goods_export");
  expect(entry).toMatchObject({
    command: "lxeskill shangman export run",
    module: "services.agent_cli.shangman.goods_export",
    ownerSkills: ["shangman-goods-export"],
    artifactPaths: [{ field: "artifact_path", role: "deliverable" }],
  });
  expect(loadLxeSkillDatasets(path).find(entry => entry.id === "shangman_goods_export")?.dir)
    .toBe("shangman/indonesia");
});

test("Yacang exposes one export command with its own deliverable dataset", () => {
  const path = join(process.cwd(), "python/lxeskill_cli/lxeskill/catalog.json");
  const entries = loadLxeSkillCommandCatalog(path).filter(entry => entry.name.startsWith("yacang_"));
  expect(entries).toHaveLength(1);
  expect(entries[0]).toMatchObject({
    command: "lxeskill yacang export run",
    module: "services.agent_cli.yacang.export_run",
    ownerSkills: ["yacang-export"],
    artifactPaths: [{ field: "artifacts[].path", role: "deliverable" }],
  });
  expect(loadLxeSkillDatasets(path).find(entry => entry.id === "yacang_exports")?.dir).toBe("yacang/exports");
});

test("Vietnam recommendation accepts no inputs and delivers only the final workbook", () => {
  const path = join(process.cwd(), "python/lxeskill_cli/lxeskill/catalog.json");
  const entries = loadLxeSkillCommandCatalog(path);
  const entry = entries.find(entry => entry.name === "vietnam_replenishment_generate");
  expect(entry).toMatchObject({
    command: "lxeskill vietnam stock recommend",
    module: "services.agent_cli.vietnam_replenishment.generate",
    ownerSkills: ["vietnam-stock-recommendation"],
    artifactPaths: [{ field: "output_xlsx", role: "deliverable" }],
  });
  expect(loadLxeSkillDatasets(path).find(entry => entry.id === "vietnam_recommendations")?.dir)
    .toBe("vietnam/recommendations");
});

test("Vietnam chat SKU binding accepts one XLSX attachment without a generic asset slot", () => {
  const path = join(process.cwd(), "python/lxeskill_cli/lxeskill/catalog.json");
  const entry = loadLxeSkillCommandCatalog(path).find(item => item.name === "vietnam_replenishment_bind_sku");
  expect(entry).toMatchObject({
    command: "lxeskill vietnam sku bind",
    module: "services.agent_cli.vietnam_replenishment.bind_sku",
    visibility: "business",
    ownerSkills: ["vietnam-stock-recommendation"],
    attributionSkill: "vietnam-stock-recommendation",
  });
  expect(entry?.artifactPaths).toBeUndefined();

  const document = JSON.parse(readFileSync(path, "utf8")) as {
    entries: Array<{
      name: string;
      exposed?: boolean;
      input_schema?: { properties?: { source_path?: Record<string, unknown> } };
    }>;
  };
  const raw = document.entries.find(item => item.name === "vietnam_replenishment_bind_sku");
  expect(raw?.exposed).toBe(true);
  expect(raw?.input_schema?.properties?.source_path?.["x-lxe-file-input"]).toMatchObject({
    accepted_extensions: [".xlsx"],
  });
  expect(raw?.input_schema?.properties?.source_path?.["x-lxe-asset-slot"]).toBeUndefined();
});

test("Mabang TMS exposes one export command with its own deliverable dataset", () => {
  const path = join(process.cwd(), "python/lxeskill_cli/lxeskill/catalog.json");
  const entries = loadLxeSkillCommandCatalog(path).filter(entry => entry.name.startsWith("mabang_tms_"));
  expect(entries).toHaveLength(1);
  expect(entries[0]).toMatchObject({
    command: "lxeskill mabang-tms export run",
    module: "services.agent_cli.mabang_tms.export_run",
    ownerSkills: ["mabang-tms-export"],
    artifactPaths: [{ field: "artifacts[].path", role: "deliverable" }],
  });
  expect(loadLxeSkillDatasets(path).find(entry => entry.id === "mabang_tms_exports")?.dir).toBe("mabang_tms/exports");
});

test("Mabang Brazil delivers original batches through a separate ERP skill", () => {
  const path = join(process.cwd(), "python/lxeskill_cli/lxeskill/catalog.json");
  const entries = loadLxeSkillCommandCatalog(path).filter(entry => entry.name === "mabang_brazil_overseas_export");
  expect(entries).toHaveLength(1);
  expect(entries[0]).toMatchObject({
    command: "lxeskill mabang brazil-overseas export run",
    module: "services.agent_cli.mabang.brazil_overseas_export",
    ownerSkills: ["mabang-brazil-export"],
    artifactPaths: [{ field: "artifacts[].path", role: "deliverable" }],
  });
  expect(loadLxeSkillDatasets(path).find(entry => entry.id === "mabang_brazil_exports")?.dir).toBe("mabang/brazil/exports");
});


test("Vietnam online, binding and offline commands declare their managed contracts", () => {
  const path = join(process.cwd(), "python/lxeskill_cli/lxeskill/catalog.json");
  const managed = loadLxeSkillCommandCatalog(path).filter(entry => entry.managedExecution);
  expect(managed.map(entry => entry.name)).toEqual([
    "vietnam_replenishment_bind_sku", "vietnam_replenishment_generate",
    "vietnam_replenishment_generate_offline",
  ]);
  expect(managed[0]?.managedExecution).toEqual({ attachmentArgument: "source_path" });
  expect(managed[1]?.managedExecution).toEqual({});
  expect(managed[2]).toMatchObject({
    command: "lxeskill vietnam stock generate",
    module: "services.agent_cli.vietnam_replenishment.generate_offline",
    ownerSkills: ["vietnam-stock-recommendation"],
    managedExecution: { attachmentArgument: "source_xlsx", attachmentCount: 3 },
    artifactPaths: [{ field: "output_xlsx", role: "deliverable" }],
  });
});

function syntheticManagedEntry(count: unknown): Record<string, unknown> {
  return {
    name: "synthetic_batch_run", module: "services.synthetic.batch", command_path: ["synthetic", "batch", "run"],
    visibility: "business", session_mode: "none", owner_skills: ["synthetic-file-skill"],
    exposed: true, timeout_ms: 180_000,
    managed_execution: { attachment_argument: "source_files", attachment_count: count },
    input_schema: { type: "object", properties: { source_files: {
      type: "array", items: { type: "string" }, minItems: count, maxItems: count,
      "x-lxe-file-input": { accepted_extensions: [".xlsx"] },
    } }, required: ["source_files"], additionalProperties: false },
  };
}

function parseSyntheticManagedCatalog(source: string) {
  const directory = mkdtempSync(join(tmpdir(), "lxe-managed-set-"));
  const path = join(directory, "catalog.json");
  try {
    writeFileSync(path, source);
    return loadLxeSkillCommandCatalog(path)[0]?.managedExecution;
  } finally { rmSync(directory, { recursive: true, force: true }); }
}

function parseSyntheticManaged(entry: Record<string, unknown>) {
  return parseSyntheticManagedCatalog(JSON.stringify({ protocol_version: "1", entries: [entry] }));
}

test("synthetic managed counts use JSON numeric value, not numeric spelling", () => {
  const source = JSON.stringify({ protocol_version: "1", entries: [syntheticManagedEntry(2)] });
  const countField = '"attachment_count":2';
  expect(source).toContain(countField);
  for (const [literal, accepted] of [
    ["2", true], ["2.0", true], ["2e0", true],
    ["0", false], ["1", false], ["9", false], ["2.5", false],
    ["true", false], ["false", false], ["null", false], ['"2"', false],
  ] as const) {
    const raw = source.replace(countField, '"attachment_count":' + literal);
    const parse = () => parseSyntheticManagedCatalog(raw);
    if (accepted) {
      expect(parse()).toEqual({ attachmentArgument: "source_files", attachmentCount: 2 });
    } else {
      expect(parse).toThrow(/managed execution/);
    }
  }
});

test("synthetic managed contracts accept exact file sets and preserve zero or one input", () => {
  for (const count of [2, 3, 8]) {
    expect(parseSyntheticManaged(syntheticManagedEntry(count))).toEqual({ attachmentArgument: "source_files", attachmentCount: count });
  }
  const none = syntheticManagedEntry(3);
  none.managed_execution = {};
  none.input_schema = { type: "object", properties: {}, additionalProperties: false };
  expect(parseSyntheticManaged(none)).toEqual({});
  const one = syntheticManagedEntry(3);
  one.managed_execution = { attachment_argument: "source_files" };
  one.input_schema = { type: "object", properties: { source_files: {
    type: "string", "x-lxe-file-input": { accepted_extensions: [".xlsx"] },
  } }, required: ["source_files"], additionalProperties: false };
  expect(parseSyntheticManaged(one)).toEqual({ attachmentArgument: "source_files" });
});

test("synthetic managed contracts reject malformed fixed counts and array schemas", () => {
  for (const count of [null, true, 1, 9, "3", 3.5]) {
    expect(() => parseSyntheticManaged(syntheticManagedEntry(count))).toThrow(/managed execution/);
  }
  for (const change of [{ type: "string" }, { items: { type: "number" } },
    { minItems: 2 }, { maxItems: 4 }, { "x-lxe-file-input": { accepted_extensions: [".csv"] } }]) {
    const invalid = syntheticManagedEntry(3);
    const schema = invalid.input_schema as { properties: { source_files: Record<string, unknown> } };
    Object.assign(schema.properties.source_files, change);
    expect(() => parseSyntheticManaged(invalid)).toThrow(/managed execution/);
  }
  const withoutArgument = syntheticManagedEntry(3);
  withoutArgument.managed_execution = { attachment_count: 3 };
  withoutArgument.input_schema = { type: "object", properties: {}, additionalProperties: false };
  expect(() => parseSyntheticManaged(withoutArgument)).toThrow(/managed execution/);
  const nullArgument = syntheticManagedEntry(3);
  nullArgument.managed_execution = { attachment_argument: null };
  nullArgument.input_schema = { type: "object", properties: {}, additionalProperties: false };
  expect(() => parseSyntheticManaged(nullArgument)).toThrow(/managed execution/);
  const nullCountWithoutArgument = syntheticManagedEntry(3);
  nullCountWithoutArgument.managed_execution = { attachment_count: null };
  nullCountWithoutArgument.input_schema = { type: "object", properties: {}, additionalProperties: false };
  expect(() => parseSyntheticManaged(nullCountWithoutArgument)).toThrow(/managed execution/);
  const nullCountWithSingle = syntheticManagedEntry(3);
  nullCountWithSingle.managed_execution = { attachment_argument: "source_files", attachment_count: null };
  nullCountWithSingle.input_schema = { type: "object", properties: { source_files: {
    type: "string", "x-lxe-file-input": { accepted_extensions: [".xlsx"] },
  } }, required: ["source_files"], additionalProperties: false };
  expect(() => parseSyntheticManaged(nullCountWithSingle)).toThrow(/managed execution/);
});

test("managed execution rejects an undeclared attachment argument", () => {
  const path = join(process.cwd(), "python/lxeskill_cli/lxeskill/catalog.json");
  const document = JSON.parse(readFileSync(path, "utf8")) as { entries: Array<Record<string, unknown>> };
  const bind = document.entries.find(entry => entry.name === "vietnam_replenishment_bind_sku")!;
  bind.managed_execution = { attachment_argument: "other_path" };
  const directory = mkdtempSync(join(tmpdir(), "lxe-managed-catalog-"));
  try {
    const invalidPath = join(directory, "catalog.json");
    writeFileSync(invalidPath, JSON.stringify(document));
    expect(() => loadLxeSkillCommandCatalog(invalidPath)).toThrow(/managed execution/);
  } finally { rmSync(directory, { recursive: true, force: true }); }
});

test("managed catalog accepts only zero or one flat deliverable declaration", () => {
  const path = join(process.cwd(), "python/lxeskill_cli/lxeskill/catalog.json");
  const original = JSON.parse(readFileSync(path, "utf8")) as { entries: Array<Record<string, unknown>> };
  const directory = mkdtempSync(join(tmpdir(), "lxe-managed-artifacts-"));
  try {
    const invalidPath = join(directory, "catalog.json");
    for (const artifactPaths of [
      null,
      [{ field: "output_xlsx", role: "diagnostic" }],
      [{ field: "artifacts[].path", role: "deliverable" }],
      [{ field: "output.path", role: "deliverable" }],
      [{ field: "output_xlsx", role: "deliverable" }, { field: "audit", role: "diagnostic" }],
      [{ field: "output_xlsx", role: "deliverable", extension: ".csv" }],
    ]) {
      const document = structuredClone(original);
      document.entries.find(entry => entry.name === "vietnam_replenishment_generate")!.artifact_paths = artifactPaths;
      writeFileSync(invalidPath, JSON.stringify(document));
      expect(() => loadLxeSkillCommandCatalog(invalidPath)).toThrow(/managed execution artifact/);
    }
  } finally { rmSync(directory, { recursive: true, force: true }); }
});

test("preselection probes are internal, unexposed and accept only one source path", () => {
  const path = join(process.cwd(), "python/lxeskill_cli/lxeskill/catalog.json");
  const probe = loadLxeSkillCommandCatalog(path).filter(entry => entry.preselectionProbe);
  expect(probe.map(entry => entry.name)).toEqual(["vietnam_replenishment_probe_sku"]);
  expect(probe[0]).toMatchObject({
    command: "lxeskill vietnam sku probe",
    visibility: "internal",
    ownerSkills: [],
    preselectionProbe: true,
    timeoutMs: 30000,
  });

  const original = JSON.parse(readFileSync(path, "utf8")) as { entries: Array<Record<string, unknown>> };
  const directory = mkdtempSync(join(tmpdir(), "lxe-preselection-catalog-"));
  try {
    const invalidPath = join(directory, "catalog.json");
    for (const change of [
      { visibility: "business" }, { exposed: true }, { session_mode: "lxe_session" },
      { owner_skills: ["stock"] }, { preselection_probe: false },
      { input_schema: { type: "object", properties: {}, additionalProperties: false } },
      { artifact_paths: [{ field: "output", role: "deliverable" }] },
    ]) {
      const document = structuredClone(original);
      Object.assign(document.entries.find(entry => entry.name === "vietnam_replenishment_probe_sku")!, change);
      writeFileSync(invalidPath, JSON.stringify(document));
      expect(() => loadLxeSkillCommandCatalog(invalidPath)).toThrow(/preselection probe/);
    }
  } finally { rmSync(directory, { recursive: true, force: true }); }
});
