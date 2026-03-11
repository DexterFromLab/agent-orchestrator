// Miscellaneous commands — CLI args, URL opening, frontend telemetry

#[tauri::command]
pub fn cli_get_group() -> Option<String> {
    let args: Vec<String> = std::env::args().collect();
    let mut i = 1;
    while i < args.len() {
        if args[i] == "--group" {
            if i + 1 < args.len() {
                return Some(args[i + 1].clone());
            }
        } else if let Some(val) = args[i].strip_prefix("--group=") {
            return Some(val.to_string());
        }
        i += 1;
    }
    None
}

#[tauri::command]
pub fn open_url(url: String) -> Result<(), String> {
    if !url.starts_with("http://") && !url.starts_with("https://") {
        return Err("Only http/https URLs are allowed".into());
    }
    std::process::Command::new("xdg-open")
        .arg(&url)
        .spawn()
        .map_err(|e| format!("Failed to open URL: {e}"))?;
    Ok(())
}

#[tauri::command]
pub fn frontend_log(level: String, message: String, context: Option<serde_json::Value>) {
    match level.as_str() {
        "error" => tracing::error!(source = "frontend", ?context, "{message}"),
        "warn" => tracing::warn!(source = "frontend", ?context, "{message}"),
        "info" => tracing::info!(source = "frontend", ?context, "{message}"),
        "debug" => tracing::debug!(source = "frontend", ?context, "{message}"),
        _ => tracing::trace!(source = "frontend", ?context, "{message}"),
    }
}
