// OpenTelemetry telemetry — tracing spans + OTLP export to Tempo/Grafana
//
// Controlled by BTERMINAL_OTLP_ENDPOINT env var:
//   - Set (e.g. "http://localhost:4318") → export traces via OTLP/HTTP + console
//   - Absent → console-only (no network calls)

use opentelemetry::trace::TracerProvider;
use opentelemetry_sdk::trace::SdkTracerProvider;
use tracing_subscriber::{layer::SubscriberExt, util::SubscriberInitExt, EnvFilter};

/// Holds the tracer provider and shuts it down on drop.
/// Store this in Tauri's managed state so it lives for the app lifetime.
pub struct TelemetryGuard {
    provider: Option<SdkTracerProvider>,
}

impl Drop for TelemetryGuard {
    fn drop(&mut self) {
        if let Some(provider) = self.provider.take() {
            if let Err(e) = provider.shutdown() {
                eprintln!("OTEL shutdown error: {e}");
            }
        }
    }
}

/// Initialize tracing with optional OTLP export.
/// Call once at app startup, before any tracing macros fire.
pub fn init() -> TelemetryGuard {
    let filter = EnvFilter::try_from_default_env()
        .unwrap_or_else(|_| EnvFilter::new("bterminal=info,bterminal_lib=info,bterminal_core=info"));

    let fmt_layer = tracing_subscriber::fmt::layer()
        .with_target(true)
        .compact();

    // In test mode, never export telemetry (avoid contaminating production data)
    let is_test = std::env::var("BTERMINAL_TEST").map_or(false, |v| v == "1");

    match std::env::var("BTERMINAL_OTLP_ENDPOINT") {
        Ok(endpoint) if !endpoint.is_empty() && !is_test => {
            match build_otlp_provider(&endpoint) {
                Ok(provider) => {
                    let otel_layer = tracing_opentelemetry::layer()
                        .with_tracer(provider.tracer("bterminal"));

                    tracing_subscriber::registry()
                        .with(filter)
                        .with(fmt_layer)
                        .with(otel_layer)
                        .init();

                    log::info!("Telemetry: OTLP export enabled → {endpoint}");
                    TelemetryGuard { provider: Some(provider) }
                }
                Err(e) => {
                    // Fall back to console-only if OTLP setup fails
                    tracing_subscriber::registry()
                        .with(filter)
                        .with(fmt_layer)
                        .init();

                    log::warn!("Telemetry: OTLP setup failed ({e}), console-only fallback");
                    TelemetryGuard { provider: None }
                }
            }
        }
        _ => {
            tracing_subscriber::registry()
                .with(filter)
                .with(fmt_layer)
                .init();

            log::info!("Telemetry: console-only (BTERMINAL_OTLP_ENDPOINT not set)");
            TelemetryGuard { provider: None }
        }
    }
}

fn build_otlp_provider(endpoint: &str) -> Result<SdkTracerProvider, Box<dyn std::error::Error>> {
    use opentelemetry_otlp::{SpanExporter, WithExportConfig};
    use opentelemetry_sdk::trace::SdkTracerProvider;
    use opentelemetry_sdk::Resource;
    use opentelemetry::KeyValue;

    let exporter = SpanExporter::builder()
        .with_http()
        .with_endpoint(endpoint)
        .build()?;

    let resource = Resource::builder()
        .with_attributes([
            KeyValue::new("service.name", "bterminal"),
            KeyValue::new("service.version", env!("CARGO_PKG_VERSION")),
        ])
        .build();

    let provider = SdkTracerProvider::builder()
        .with_batch_exporter(exporter)
        .with_resource(resource)
        .build();

    Ok(provider)
}
