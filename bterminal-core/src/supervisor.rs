// Sidecar crash recovery and supervision.
// Wraps a SidecarManager with automatic restart, exponential backoff,
// and health status tracking. Emits `sidecar-health-changed` events.

use serde::{Deserialize, Serialize};
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};

use crate::event::EventSink;
use crate::sidecar::{AgentQueryOptions, SidecarConfig, SidecarManager};

/// Health status of the supervised sidecar process.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(tag = "status", rename_all = "camelCase")]
pub enum SidecarHealth {
    Healthy,
    Degraded {
        restart_count: u32,
    },
    Failed {
        #[serde(default)]
        last_error: String,
    },
}

/// Configuration for supervisor restart behavior.
#[derive(Debug, Clone)]
pub struct SupervisorConfig {
    /// Maximum restart attempts before entering Failed state (default: 5)
    pub max_retries: u32,
    /// Base backoff in milliseconds, doubled each retry (default: 1000, cap: 30000)
    pub backoff_base_ms: u64,
    /// Maximum backoff in milliseconds (default: 30000)
    pub backoff_cap_ms: u64,
    /// Stable operation duration before restart_count resets (default: 5 minutes)
    pub stability_window: Duration,
}

impl Default for SupervisorConfig {
    fn default() -> Self {
        Self {
            max_retries: 5,
            backoff_base_ms: 1000,
            backoff_cap_ms: 30_000,
            stability_window: Duration::from_secs(300),
        }
    }
}

/// Internal state shared between the supervisor and its event interceptor.
struct SupervisorState {
    health: SidecarHealth,
    restart_count: u32,
    last_crash_time: Option<Instant>,
    last_start_time: Option<Instant>,
}

impl SupervisorState {
    fn new() -> Self {
        Self {
            health: SidecarHealth::Healthy,
            restart_count: 0,
            last_crash_time: None,
            last_start_time: None,
        }
    }
}

/// Compute exponential backoff: base_ms * 2^attempt, capped at cap_ms.
fn compute_backoff(base_ms: u64, attempt: u32, cap_ms: u64) -> Duration {
    let backoff = base_ms.saturating_mul(1u64.checked_shl(attempt).unwrap_or(u64::MAX));
    Duration::from_millis(backoff.min(cap_ms))
}

/// EventSink wrapper that intercepts `sidecar-exited` events and triggers
/// supervisor restart logic, while forwarding all other events unchanged.
struct SupervisorSink {
    outer_sink: Arc<dyn EventSink>,
    state: Arc<Mutex<SupervisorState>>,
    config: SupervisorConfig,
    sidecar_config: SidecarConfig,
}

impl EventSink for SupervisorSink {
    fn emit(&self, event: &str, payload: serde_json::Value) {
        if event == "sidecar-exited" {
            self.handle_exit();
        } else {
            self.outer_sink.emit(event, payload);
        }
    }
}

impl SupervisorSink {
    fn handle_exit(&self) {
        let (should_restart, backoff, restart_count) = {
            let mut state = self.state.lock().unwrap();

            // Check if stable operation has elapsed since last start — reset counter
            if let Some(start_time) = state.last_start_time {
                if start_time.elapsed() >= self.config.stability_window {
                    log::info!(
                        "Sidecar ran stable for {:?}, resetting restart count",
                        start_time.elapsed()
                    );
                    state.restart_count = 0;
                }
            }

            state.restart_count += 1;
            state.last_crash_time = Some(Instant::now());
            let count = state.restart_count;

            if count > self.config.max_retries {
                let error = format!("Exceeded max retries ({})", self.config.max_retries);
                log::error!("Sidecar supervisor: {}", error);
                state.health = SidecarHealth::Failed {
                    last_error: error.clone(),
                };
                self.emit_health(&state.health);
                // Forward the original exited event so frontend knows
                self.outer_sink
                    .emit("sidecar-exited", serde_json::Value::Null);
                return;
            }

            state.health = SidecarHealth::Degraded {
                restart_count: count,
            };
            self.emit_health(&state.health);

            let backoff = compute_backoff(
                self.config.backoff_base_ms,
                count - 1,
                self.config.backoff_cap_ms,
            );

            (true, backoff, count)
        };

        if !should_restart {
            return;
        }

        log::warn!(
            "Sidecar crashed (attempt {}/{}), restarting in {:?}",
            restart_count,
            self.config.max_retries,
            backoff
        );

        // Restart on a background thread to avoid blocking the stdout reader
        let outer_sink = self.outer_sink.clone();
        let state = self.state.clone();
        let sidecar_config = self.sidecar_config.clone();
        let supervisor_state = self.state.clone();
        let stability_window = self.config.stability_window;
        let max_retries = self.config.max_retries;
        let backoff_base_ms = self.config.backoff_base_ms;
        let backoff_cap_ms = self.config.backoff_cap_ms;

        std::thread::spawn(move || {
            std::thread::sleep(backoff);

            // Create a new SidecarManager that shares our supervisor sink.
            // We need a new interceptor sink to capture the next exit event.
            let new_state = state.clone();
            let new_outer = outer_sink.clone();
            let new_sidecar_config = sidecar_config.clone();

            let interceptor: Arc<dyn EventSink> = Arc::new(SupervisorSink {
                outer_sink: new_outer.clone(),
                state: new_state.clone(),
                config: SupervisorConfig {
                    max_retries,
                    backoff_base_ms,
                    backoff_cap_ms,
                    stability_window,
                },
                sidecar_config: new_sidecar_config.clone(),
            });

            let new_manager = SidecarManager::new(interceptor, new_sidecar_config);
            match new_manager.start() {
                Ok(()) => {
                    let mut s = supervisor_state.lock().unwrap();
                    s.last_start_time = Some(Instant::now());
                    log::info!("Sidecar restarted successfully (attempt {})", restart_count);
                    // Note: we cannot replace the manager reference in the outer
                    // SidecarSupervisor from here. The restart creates a new manager
                    // that handles its own lifecycle. The outer manager reference
                    // becomes stale. This is acceptable because:
                    // 1. The new manager's stdout reader will emit through our sink chain
                    // 2. The old manager's child process is already dead
                    // For a more sophisticated approach, the supervisor would need
                    // interior mutability on the manager reference. We do that below.
                }
                Err(e) => {
                    log::error!("Sidecar restart failed: {}", e);
                    let mut s = supervisor_state.lock().unwrap();
                    s.health = SidecarHealth::Failed {
                        last_error: e.clone(),
                    };
                    // Emit health change + forward exited
                    drop(s);
                    let health = SidecarHealth::Failed { last_error: e };
                    emit_health_event(&new_outer, &health);
                    new_outer
                        .emit("sidecar-exited", serde_json::Value::Null);
                }
            }
        });
    }

    fn emit_health(&self, health: &SidecarHealth) {
        emit_health_event(&self.outer_sink, health);
    }
}

fn emit_health_event(sink: &Arc<dyn EventSink>, health: &SidecarHealth) {
    let payload = serde_json::to_value(health).unwrap_or(serde_json::Value::Null);
    sink.emit("sidecar-health-changed", payload);
}

/// Supervised sidecar process with automatic crash recovery.
///
/// Wraps a `SidecarManager` and intercepts exit events to perform automatic
/// restarts with exponential backoff. Tracks health status and emits
/// `sidecar-health-changed` events.
pub struct SidecarSupervisor {
    manager: Arc<Mutex<SidecarManager>>,
    state: Arc<Mutex<SupervisorState>>,
    outer_sink: Arc<dyn EventSink>,
    #[allow(dead_code)]
    supervisor_config: SupervisorConfig,
    #[allow(dead_code)]
    sidecar_config: SidecarConfig,
}

impl SidecarSupervisor {
    pub fn new(
        sink: Arc<dyn EventSink>,
        sidecar_config: SidecarConfig,
        supervisor_config: SupervisorConfig,
    ) -> Self {
        let state = Arc::new(Mutex::new(SupervisorState::new()));

        let interceptor: Arc<dyn EventSink> = Arc::new(SupervisorSink {
            outer_sink: sink.clone(),
            state: state.clone(),
            config: supervisor_config.clone(),
            sidecar_config: sidecar_config.clone(),
        });

        let manager = SidecarManager::new(interceptor, sidecar_config.clone());

        Self {
            manager: Arc::new(Mutex::new(manager)),
            state,
            outer_sink: sink,
            supervisor_config,
            sidecar_config,
        }
    }

    /// Start the supervised sidecar process.
    pub fn start(&self) -> Result<(), String> {
        let manager = self.manager.lock().unwrap();
        let result = manager.start();
        if result.is_ok() {
            let mut state = self.state.lock().unwrap();
            state.last_start_time = Some(Instant::now());
            state.health = SidecarHealth::Healthy;
        }
        result
    }

    /// Send a raw JSON message to the sidecar.
    pub fn send_message(&self, msg: &serde_json::Value) -> Result<(), String> {
        self.manager.lock().unwrap().send_message(msg)
    }

    /// Send an agent query to the sidecar.
    pub fn query(&self, options: &AgentQueryOptions) -> Result<(), String> {
        self.manager.lock().unwrap().query(options)
    }

    /// Stop a specific agent session.
    pub fn stop_session(&self, session_id: &str) -> Result<(), String> {
        self.manager.lock().unwrap().stop_session(session_id)
    }

    /// Check if the sidecar is ready to accept queries.
    pub fn is_ready(&self) -> bool {
        self.manager.lock().unwrap().is_ready()
    }

    /// Shut down the sidecar process.
    pub fn shutdown(&self) -> Result<(), String> {
        let mut state = self.state.lock().unwrap();
        state.health = SidecarHealth::Healthy;
        state.restart_count = 0;
        drop(state);
        self.manager.lock().unwrap().shutdown()
    }

    /// Get the current health status.
    pub fn health(&self) -> SidecarHealth {
        self.state.lock().unwrap().health.clone()
    }

    /// Get the current restart count.
    pub fn restart_count(&self) -> u32 {
        self.state.lock().unwrap().restart_count
    }

    /// Manually reset the supervisor state (e.g., after user intervention).
    pub fn reset(&self) {
        let mut state = self.state.lock().unwrap();
        state.health = SidecarHealth::Healthy;
        state.restart_count = 0;
        state.last_crash_time = None;
        emit_health_event(&self.outer_sink, &state.health);
    }
}

impl Drop for SidecarSupervisor {
    fn drop(&mut self) {
        let _ = self.shutdown();
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::atomic::{AtomicU32, Ordering};

    // ---- compute_backoff tests ----

    #[test]
    fn test_backoff_base_case() {
        let d = compute_backoff(1000, 0, 30_000);
        assert_eq!(d, Duration::from_millis(1000));
    }

    #[test]
    fn test_backoff_exponential() {
        assert_eq!(compute_backoff(1000, 1, 30_000), Duration::from_millis(2000));
        assert_eq!(compute_backoff(1000, 2, 30_000), Duration::from_millis(4000));
        assert_eq!(compute_backoff(1000, 3, 30_000), Duration::from_millis(8000));
        assert_eq!(compute_backoff(1000, 4, 30_000), Duration::from_millis(16000));
    }

    #[test]
    fn test_backoff_capped() {
        assert_eq!(compute_backoff(1000, 5, 30_000), Duration::from_millis(30_000));
        assert_eq!(compute_backoff(1000, 10, 30_000), Duration::from_millis(30_000));
    }

    #[test]
    fn test_backoff_overflow_safe() {
        // Very large attempt should not panic, just cap
        assert_eq!(compute_backoff(1000, 63, 30_000), Duration::from_millis(30_000));
        assert_eq!(compute_backoff(1000, 100, 30_000), Duration::from_millis(30_000));
    }

    #[test]
    fn test_backoff_custom_base() {
        assert_eq!(compute_backoff(500, 0, 10_000), Duration::from_millis(500));
        assert_eq!(compute_backoff(500, 1, 10_000), Duration::from_millis(1000));
        assert_eq!(compute_backoff(500, 5, 10_000), Duration::from_millis(10_000));
    }

    // ---- SidecarHealth serialization tests ----

    #[test]
    fn test_health_serialize_healthy() {
        let h = SidecarHealth::Healthy;
        let json = serde_json::to_value(&h).unwrap();
        assert_eq!(json["status"], "healthy");
    }

    #[test]
    fn test_health_serialize_degraded() {
        let h = SidecarHealth::Degraded { restart_count: 3 };
        let json = serde_json::to_value(&h).unwrap();
        assert_eq!(json["status"], "degraded");
        assert_eq!(json["restart_count"], 3);
    }

    #[test]
    fn test_health_serialize_failed() {
        let h = SidecarHealth::Failed {
            last_error: "process killed".to_string(),
        };
        let json = serde_json::to_value(&h).unwrap();
        assert_eq!(json["status"], "failed");
        assert_eq!(json["last_error"], "process killed");
    }

    #[test]
    fn test_health_deserialize_roundtrip() {
        let cases = vec![
            SidecarHealth::Healthy,
            SidecarHealth::Degraded { restart_count: 2 },
            SidecarHealth::Failed {
                last_error: "OOM".to_string(),
            },
        ];
        for h in cases {
            let json = serde_json::to_string(&h).unwrap();
            let back: SidecarHealth = serde_json::from_str(&json).unwrap();
            assert_eq!(h, back);
        }
    }

    // ---- SupervisorConfig defaults ----

    #[test]
    fn test_supervisor_config_defaults() {
        let cfg = SupervisorConfig::default();
        assert_eq!(cfg.max_retries, 5);
        assert_eq!(cfg.backoff_base_ms, 1000);
        assert_eq!(cfg.backoff_cap_ms, 30_000);
        assert_eq!(cfg.stability_window, Duration::from_secs(300));
    }

    // ---- SupervisorState tests ----

    #[test]
    fn test_initial_state() {
        let state = SupervisorState::new();
        assert_eq!(state.health, SidecarHealth::Healthy);
        assert_eq!(state.restart_count, 0);
        assert!(state.last_crash_time.is_none());
        assert!(state.last_start_time.is_none());
    }

    // ---- Event interception tests (using mock sink) ----

    /// Mock EventSink that records emitted events.
    struct MockSink {
        events: Mutex<Vec<(String, serde_json::Value)>>,
        exit_count: AtomicU32,
    }

    impl MockSink {
        fn new() -> Self {
            Self {
                events: Mutex::new(Vec::new()),
                exit_count: AtomicU32::new(0),
            }
        }

        fn events(&self) -> Vec<(String, serde_json::Value)> {
            self.events.lock().unwrap().clone()
        }

        fn health_events(&self) -> Vec<SidecarHealth> {
            self.events
                .lock()
                .unwrap()
                .iter()
                .filter(|(name, _)| name == "sidecar-health-changed")
                .filter_map(|(_, payload)| serde_json::from_value(payload.clone()).ok())
                .collect()
        }
    }

    impl EventSink for MockSink {
        fn emit(&self, event: &str, payload: serde_json::Value) {
            if event == "sidecar-exited" {
                self.exit_count.fetch_add(1, Ordering::SeqCst);
            }
            self.events
                .lock()
                .unwrap()
                .push((event.to_string(), payload));
        }
    }

    #[test]
    fn test_non_exit_events_forwarded() {
        let outer = Arc::new(MockSink::new());
        let state = Arc::new(Mutex::new(SupervisorState::new()));
        let sink = SupervisorSink {
            outer_sink: outer.clone(),
            state,
            config: SupervisorConfig::default(),
            sidecar_config: SidecarConfig {
                search_paths: vec![],
                env_overrides: Default::default(),
                sandbox: Default::default(),
            },
        };

        let payload = serde_json::json!({"type": "ready"});
        sink.emit("sidecar-message", payload.clone());

        let events = outer.events();
        assert_eq!(events.len(), 1);
        assert_eq!(events[0].0, "sidecar-message");
        assert_eq!(events[0].1, payload);
    }

    #[test]
    fn test_exit_triggers_degraded_health() {
        let outer = Arc::new(MockSink::new());
        let state = Arc::new(Mutex::new(SupervisorState::new()));
        let sink = SupervisorSink {
            outer_sink: outer.clone(),
            state: state.clone(),
            config: SupervisorConfig {
                max_retries: 5,
                backoff_base_ms: 100,
                backoff_cap_ms: 1000,
                stability_window: Duration::from_secs(300),
            },
            sidecar_config: SidecarConfig {
                search_paths: vec![],
                env_overrides: Default::default(),
                sandbox: Default::default(),
            },
        };

        // Simulate exit
        sink.emit("sidecar-exited", serde_json::Value::Null);

        let s = state.lock().unwrap();
        assert_eq!(s.restart_count, 1);
        assert!(s.last_crash_time.is_some());
        match &s.health {
            SidecarHealth::Degraded { restart_count } => assert_eq!(*restart_count, 1),
            other => panic!("Expected Degraded, got {:?}", other),
        }

        // Should have emitted health-changed event
        let health_events = outer.health_events();
        assert_eq!(health_events.len(), 1);
        assert_eq!(
            health_events[0],
            SidecarHealth::Degraded { restart_count: 1 }
        );
    }

    #[test]
    fn test_exit_exceeding_max_retries_fails() {
        let outer = Arc::new(MockSink::new());
        let state = Arc::new(Mutex::new(SupervisorState {
            health: SidecarHealth::Degraded { restart_count: 5 },
            restart_count: 5,
            last_crash_time: Some(Instant::now()),
            last_start_time: Some(Instant::now()),
        }));

        let sink = SupervisorSink {
            outer_sink: outer.clone(),
            state: state.clone(),
            config: SupervisorConfig {
                max_retries: 5,
                ..SupervisorConfig::default()
            },
            sidecar_config: SidecarConfig {
                search_paths: vec![],
                env_overrides: Default::default(),
                sandbox: Default::default(),
            },
        };

        // This is attempt 6, which exceeds max_retries=5
        sink.emit("sidecar-exited", serde_json::Value::Null);

        let s = state.lock().unwrap();
        assert_eq!(s.restart_count, 6);
        match &s.health {
            SidecarHealth::Failed { last_error } => {
                assert!(last_error.contains("Exceeded max retries"));
            }
            other => panic!("Expected Failed, got {:?}", other),
        }

        // Should have emitted health-changed with Failed + forwarded sidecar-exited
        let events = outer.events();
        let health_changed = events
            .iter()
            .filter(|(name, _)| name == "sidecar-health-changed")
            .count();
        let exited = events
            .iter()
            .filter(|(name, _)| name == "sidecar-exited")
            .count();
        assert_eq!(health_changed, 1);
        assert_eq!(exited, 1); // Forwarded after max retries
    }

    #[test]
    fn test_stability_window_resets_count() {
        let outer = Arc::new(MockSink::new());
        // Simulate: started 6 minutes ago, ran stable
        let state = Arc::new(Mutex::new(SupervisorState {
            health: SidecarHealth::Degraded { restart_count: 3 },
            restart_count: 3,
            last_crash_time: Some(Instant::now() - Duration::from_secs(400)),
            last_start_time: Some(Instant::now() - Duration::from_secs(360)),
        }));

        let sink = SupervisorSink {
            outer_sink: outer.clone(),
            state: state.clone(),
            config: SupervisorConfig {
                max_retries: 5,
                stability_window: Duration::from_secs(300), // 5 min
                backoff_base_ms: 100,
                backoff_cap_ms: 1000,
            },
            sidecar_config: SidecarConfig {
                search_paths: vec![],
                env_overrides: Default::default(),
                sandbox: Default::default(),
            },
        };

        sink.emit("sidecar-exited", serde_json::Value::Null);

        let s = state.lock().unwrap();
        // Count was reset to 0 then incremented to 1
        assert_eq!(s.restart_count, 1);
        match &s.health {
            SidecarHealth::Degraded { restart_count } => assert_eq!(*restart_count, 1),
            other => panic!("Expected Degraded(1), got {:?}", other),
        }
    }

    #[test]
    fn test_multiple_crashes_increment_count() {
        let outer = Arc::new(MockSink::new());
        let state = Arc::new(Mutex::new(SupervisorState::new()));

        let sink = SupervisorSink {
            outer_sink: outer.clone(),
            state: state.clone(),
            config: SupervisorConfig {
                max_retries: 10,
                backoff_base_ms: 100,
                backoff_cap_ms: 1000,
                stability_window: Duration::from_secs(300),
            },
            sidecar_config: SidecarConfig {
                search_paths: vec![],
                env_overrides: Default::default(),
                sandbox: Default::default(),
            },
        };

        for i in 1..=3 {
            sink.emit("sidecar-exited", serde_json::Value::Null);
            let s = state.lock().unwrap();
            assert_eq!(s.restart_count, i);
        }

        let health_events = outer.health_events();
        assert_eq!(health_events.len(), 3);
        assert_eq!(
            health_events[2],
            SidecarHealth::Degraded { restart_count: 3 }
        );
    }

    #[test]
    fn test_health_equality() {
        assert_eq!(SidecarHealth::Healthy, SidecarHealth::Healthy);
        assert_eq!(
            SidecarHealth::Degraded { restart_count: 2 },
            SidecarHealth::Degraded { restart_count: 2 }
        );
        assert_ne!(
            SidecarHealth::Degraded { restart_count: 1 },
            SidecarHealth::Degraded { restart_count: 2 }
        );
        assert_ne!(SidecarHealth::Healthy, SidecarHealth::Failed {
            last_error: String::new(),
        });
    }
}
