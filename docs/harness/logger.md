# 日志与诊断

本文统一维护日志位置、级别、关联字段、事件、脱敏和故障隔离规则。托管文件使用 JSONL，Desktop 配置后的终端输出使用 pretty 格式；日志只提供诊断证据，持久用量和会话状态以 SQLite 为准。

The shared logging implementation is `packages/foundation/core/src/logging.ts`. Provider wire-trace sanitization and file layout are implemented by `packages/agent/runtime/src/providers/wire-trace.ts`.

## Logging Surfaces

The project separates three outputs with different audiences:

| Surface | Purpose | Typical level |
| --- | --- | --- |
| Terminal | concise operator-visible lifecycle and failures | `INFO` |
| Runtime log file | detailed structured diagnostics | `DEBUG` or configured level |
| Provider wire trace | opt-in provider protocol investigation | verbose, sanitized |

Reducing terminal noise must not remove useful runtime diagnostics. Conversely, enabling detailed files must not print secrets or large payloads to the terminal.

## Runtime Projection

Users select the `off`, `standard`, or `diagnostic` logging profile and retention period in Desktop settings. Desktop stores that choice in `var/config/settings.json` and projects the internal `LOG_LEVEL`, `RUNTIME_LOG_LEVEL`, `LOCAL_LOGS_ENABLED`, retention, and trace variables into child processes. Those environment names are process transport, not user-owned configuration files.

Terminal logs always use the human-readable pretty format; managed files use JSONL. Local files are written below the active `LXE_DATA_ROOT/logs/` tree with product-owned file names. Trace writers use dated session/turn directories so one failing call can be inspected without scanning an entire process log.

Wire traces use the main-compatible per-attempt layout:

```text
var/logs/sse_wire_traces/YYYYMMDD/HHMM_<session>/<turn>/step_<zero-based-step>_attempt_<attempt>.jsonl
```

Each successful attempt records `request_start`, `response_start`, every SDK `wire_event`, and one `request_end`. A failure before an HTTP response omits `response_start`. Existing legacy `provider.jsonl` files are retained, but new turns do not create them.

`LOCAL_LOGS_ENABLED` governs local file writes only. Ordinary console logging remains available when local logs are disabled. New Desktop installations use the `standard` profile, which enables `INFO` files with seven-day retention. Both Desktop processes emit `logging_configured` with the effective level, disabled reason, and resolved path during startup.

File responsibilities are intentionally separate:

- Electron Main and Gateway records (JSONL): `var/logs/runtime/YYYYMMDD/desktop.log`.
- Private `agent-cli` and Runtime records (JSONL): `var/logs/runtime/YYYYMMDD/runtime.log`.
- Python text logs (standalone `lxeskill` commands): `var/logs/runtime/YYYYMMDD/runtime-py.log`.
- Browser-auth text logs: `var/logs/browser_auth_service/YYYYMMDD/browser_auth_service.log`.
- Feishu raw events: `var/logs/feishu_raw_events/YYYYMMDD.jsonl`.
- Provider wire traces: `var/logs/sse_wire_traces/`.
- Ziniao diagnostic traces: `var/logs/ziniao_traces/`.

Runtime execution semantics are intentionally not duplicated into a second per-turn trace. Use `runtime.log` for correlated Turn, Provider-attempt, tool, cancellation, error, and usage summaries; durable usage remains in `turn_usage` SQLite. The retired `var/logs/agent_traces/` directory is no longer written and is removed naturally by the configured retention policy after its dated entries expire.

`LXE_DATA_ROOT` is the canonical `var` root. Desktop resolves every path above from it and exposes
`LXE_DATA_ROOT/logs` as the diagnostics directory. Desktop does not read, migrate, or delete the former
AppData/Application Support state tree.

## Record Shape And Context

The sink emits structured JSONL records to managed files. Records include timestamp, level, logger name, message, and scoped fields. Async context carries identifiers such as session, turn, job, or tool so nested modules do not have to repeat plumbing in every log call.

Use module-scoped logger names and stable event messages. Put high-cardinality IDs and details in fields rather than interpolating them into the message text.

Core `AsyncLocalStorage` propagates these fields across asynchronous calls:

- `session_id`
- `turn_id`
- `response_route_id`
- `message_id`
- `task_id`

Active context overrides child-logger and call-site fields so a nested operation cannot accidentally change its parent correlation IDs. A background completion callback must explicitly restore its saved context because it may run after the originating turn has ended.

Typical accepted-message chain:

```text
feishu_inbound_normalized(message_id, response_route_id)
  -> inbound_received(session_id)
  -> message_queued(turn_id)
  -> scheduler_job_dispatched
  -> turn_started
  -> provider_attempt_started/completed
  -> tool_started/completed
  -> turn_completed
  -> scheduler_job_released
```

Each Runtime turn has exactly one `turn_started` and exactly one terminal `turn_completed`. The terminal status is `completed`, `cancelled`, or `error`.

## Level Guidance

- `INFO`: process lifecycle, accepted user work, concise turn/tool summaries, recoverable operator actions.
- `WARN`: degraded but continuing behavior, optional integration failures, retry exhaustion with fallback.
- `ERROR`: required operation failed or process health is compromised; emit the terminal failure once from the module responsible for the final outcome.
- `DEBUG`: request IDs, routes, timing internals, provider and adapter decisions; use counts and status instead of tool payloads.

`gateway.event_loop` samples timer lateness every 500ms and emits an `event_loop_lag` warning when a sample fires 500ms late or more. Sustained records mean synchronous work is starving the event loop — WebSocket pings, card streaming, and heartbeats stall together — so treat them as a performance signal, not noise.

Successful health polling and repetitive stream updates should not dominate INFO output. Raw inbound content, credentials, cookies, headers, and complete tool payloads do not belong at any unsanitized level. Explicitly enabled wire traces are the only surface allowed to retain sanitized Provider request and stream content.

## Event families

| Boundary | Stable events |
|---|---|
| Runtime turn | `turn_started`, `provider_attempt_started`, `provider_stream_heartbeat`, `provider_attempt_completed`, `provider_attempt_failed`, `tool_started`, `tool_completed`, `heartbeat_noop`, `pending_events_popped`, `pending_events_attached`, `turn_completed` |
| Routing | `inbound_received`, `permission_denied`, `session_created`, `session_rebound`, `message_queued`, `message_steered`, `control_completed` |
| Scheduler | `scheduler_job_enqueued`, `scheduler_job_dispatched`, `scheduler_job_released`, `scheduler_stop_requested`, `scheduler_pending_cleared`, `scheduler_steering_requeued` |
| Heartbeat | `heartbeat_requested`, `heartbeat_deduplicated`, `heartbeat_deferred`, `heartbeat_dropped`, `heartbeat_enqueued` |
| Feishu ingress | `feishu_inbound_rejected`, `feishu_inbound_normalized`, `feishu_inbound_sink_completed`, `feishu_inbound_failed`, `feishu_quote_lookup_failed`, `feishu_card_content_fetch_failed` |
| Feishu connection | `feishu_connection_starting`, `feishu_connected`, `feishu_reconnecting`, `feishu_reconnected`, `feishu_connection_failed`, `feishu_connection_stopped` |
| CardKit delivery | `card_created`, `card_frame_coalesced`, `card_reference_retry_scheduled`, `card_reference_retry_succeeded`, `card_reference_retry_exhausted`, `card_send_completed`, `card_dead`, `card_finalized` |
| Stream fallback | `stream_fallback_started`, `stream_fallback_completed`, `stream_fallback_failed` |
| Idle restart | `feishu_restart_scheduled`, `feishu_restart_deferred`, `feishu_restart_started`, `feishu_restart_completed`, `feishu_restart_failed`, `feishu_restart_stop_timed_out` |
| Session exec | `process_started`, `process_yielded`, `process_completed`, `process_killed`, `process_force_killed`, `process_evicted`, `process_notification_failed` |
| Maintenance | `maintenance_configured`, `maintenance_task_started`, `maintenance_task_completed`, `maintenance_single_flight_coalesced`, `maintenance_single_flight_rerun`, `auth_refresh_succeeded`, `auth_refresh_failed`, `data_sync_uploaded`, `data_sync_skipped`, `data_sync_failed` |
| MCP and skills | `mcp_enabled`, `mcp_connected`, `mcp_startup_failed`, `mcp_disabled`, `mcp_disconnected`, `skill_catalog_loaded`, `skill_external_skipped` |
| Gateway lifecycle | `gateway_starting`, `gateway_ready`, `gateway_start_failed`, `gateway_stopping`, `gateway_stopped`, `startup_component_ready`, `shutdown_component_stopping`, `shutdown_component_stopped`, `shutdown_component_failed` |

Heartbeat drop/defer reasons are restricted to `autonomy_suspended`, `no_pending_events`, `session_busy`, `session_missing`, and `invalid_source`. Feishu normalize rejection reasons are restricted to `duplicate`, `stale`, `bot_app_id_mismatch`, `group_bot_identity_missing`, `group_without_bot_mention`, `missing_sender_open_id`, and `empty_content`.

Desktop Renderer 通过 preload IPC 与 Main 通信，不启动 Dashboard HTTP listener。启动与可用性排障查看 Gateway lifecycle、agent-cli 握手及桌面健康状态；不使用旧的 `dashboard_listening` 或浏览器自动打开事件。

## Sanitization

Runtime tracing recursively redacts secret-like keys including authorization, API keys, tokens, passwords, cookies, signatures, and secret fields. Wire traces preserve readable `thinking_delta` content for protocol diagnosis, but replace:

- signatures and encrypted `redacted_thinking.data`;
- base64 and embedded media payloads;
- absolute local paths;
- strings beyond the trace size limit.

Sanitization is defense in depth, not permission to log arbitrary inputs. Normal logs must not include full user text, Provider bodies, tool inputs/outputs, command text, process output, credentials, HTTP headers, cookies, or Axios objects. Call sites should prefer byte count, item count, status, and elapsed time. Explicitly enabled wire traces are the single exception for sanitized Provider request and stream content.

Core serialization handles sensitive keys, binary values, cycles and `BigInt`; only safe Error fields and a bounded cause chain survive. Depth, item and string budgets are defined in [`logging.ts`](/packages/foundation/core/src/logging.ts), with explicit truncation markers.

The official Feishu SDK logger is suppressed to avoid duplicate Axios diagnostics. The adapter records connection lifecycle, CardKit records operation/state decisions, and Runtime owns the final outbound-delivery warning. Lookup/download failures retain endpoint, HTTP status, provider code, subcode and log ID when available. They distinguish observations from verified causes and never translate an unmapped status or SDK message into an invented permissions, expiration, network or client-version diagnosis.

## Failure Isolation, Retention And Shutdown

Logger writers, traces, retention cleanup and local-file sinks must never change a business result. A local sink disables itself after its first write failure, reports `logging_sink_failed` once, and exposes `disabledReason="sink_failed"` plus a safe `lastError` in logging status.

Retention cleanup deletes only managed dated log directories older than the configured period. It must not traverse unrelated user paths. File sinks are flushed during orderly shutdown and fatal-error handling so the final diagnostic record is not lost.

`agent-cli serve` and business CLI commands reserve stdout for their JSON protocol. Their diagnostics go through logging/stderr; writing log prose to stdout would corrupt agent parsing.

## Troubleshooting

1. Confirm whether the missing information belongs in terminal logs, runtime files, or traces.
2. Check `LOCAL_LOGS_ENABLED` and the relevant level thresholds.
3. In Desktop settings, check both the Desktop/Gateway and `agent-cli` sink status, effective path, and safe failure detail.
4. Check `LOG_LEVELS` for a prefix override.
5. For provider streams, enable only the required trace surface and reproduce one turn.
6. Verify the resulting record is sanitized before sharing it.
7. Disable verbose tracing after the investigation.
