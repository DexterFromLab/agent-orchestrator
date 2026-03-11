// Claude profile and skill discovery commands

#[derive(serde::Serialize)]
pub struct ClaudeProfile {
    pub name: String,
    pub email: Option<String>,
    pub subscription_type: Option<String>,
    pub display_name: Option<String>,
    pub config_dir: String,
}

#[derive(serde::Serialize)]
pub struct ClaudeSkill {
    pub name: String,
    pub description: String,
    pub source_path: String,
}

#[tauri::command]
pub fn claude_list_profiles() -> Vec<ClaudeProfile> {
    let mut profiles = Vec::new();

    let config_dir = dirs::config_dir().unwrap_or_default();
    let profiles_dir = config_dir.join("switcher").join("profiles");
    let alt_dir_root = config_dir.join("switcher-claude");

    if let Ok(entries) = std::fs::read_dir(&profiles_dir) {
        for entry in entries.flatten() {
            if !entry.path().is_dir() { continue; }
            let name = entry.file_name().to_string_lossy().to_string();

            let toml_path = entry.path().join("profile.toml");
            let (email, subscription_type, display_name) = if toml_path.exists() {
                let content = std::fs::read_to_string(&toml_path).unwrap_or_else(|e| {
                    log::warn!("Failed to read {}: {e}", toml_path.display());
                    String::new()
                });
                (
                    extract_toml_value(&content, "email"),
                    extract_toml_value(&content, "subscription_type"),
                    extract_toml_value(&content, "display_name"),
                )
            } else {
                (None, None, None)
            };

            let alt_path = alt_dir_root.join(&name);
            let config_dir_str = if alt_path.exists() {
                alt_path.to_string_lossy().to_string()
            } else {
                dirs::home_dir()
                    .unwrap_or_default()
                    .join(".claude")
                    .to_string_lossy()
                    .to_string()
            };

            profiles.push(ClaudeProfile {
                name,
                email,
                subscription_type,
                display_name,
                config_dir: config_dir_str,
            });
        }
    }

    if profiles.is_empty() {
        let home = dirs::home_dir().unwrap_or_default();
        profiles.push(ClaudeProfile {
            name: "default".to_string(),
            email: None,
            subscription_type: None,
            display_name: None,
            config_dir: home.join(".claude").to_string_lossy().to_string(),
        });
    }

    profiles
}

fn extract_toml_value(content: &str, key: &str) -> Option<String> {
    for line in content.lines() {
        let trimmed = line.trim();
        if let Some(rest) = trimmed.strip_prefix(key) {
            if let Some(rest) = rest.trim().strip_prefix('=') {
                let val = rest.trim().trim_matches('"');
                if !val.is_empty() {
                    return Some(val.to_string());
                }
            }
        }
    }
    None
}

#[tauri::command]
pub fn claude_list_skills() -> Vec<ClaudeSkill> {
    let mut skills = Vec::new();
    let home = dirs::home_dir().unwrap_or_default();

    let skills_dir = home.join(".claude").join("skills");
    if let Ok(entries) = std::fs::read_dir(&skills_dir) {
        for entry in entries.flatten() {
            let path = entry.path();
            let (name, skill_file) = if path.is_dir() {
                let skill_md = path.join("SKILL.md");
                if skill_md.exists() {
                    (entry.file_name().to_string_lossy().to_string(), skill_md)
                } else {
                    continue;
                }
            } else if path.extension().map_or(false, |e| e == "md") {
                let stem = path.file_stem().unwrap_or_default().to_string_lossy().to_string();
                (stem, path.clone())
            } else {
                continue;
            };

            let description = if let Ok(content) = std::fs::read_to_string(&skill_file) {
                content.lines()
                    .filter(|l| !l.trim().is_empty() && !l.starts_with('#'))
                    .next()
                    .unwrap_or("")
                    .trim()
                    .chars()
                    .take(120)
                    .collect()
            } else {
                String::new()
            };

            skills.push(ClaudeSkill {
                name,
                description,
                source_path: skill_file.to_string_lossy().to_string(),
            });
        }
    }

    skills
}

#[tauri::command]
pub fn claude_read_skill(path: String) -> Result<String, String> {
    let skills_dir = dirs::home_dir()
        .ok_or("Cannot determine home directory")?
        .join(".claude")
        .join("skills");
    let canonical_skills = skills_dir.canonicalize()
        .map_err(|_| "Skills directory does not exist".to_string())?;
    let canonical_path = std::path::Path::new(&path).canonicalize()
        .map_err(|e| format!("Invalid skill path: {e}"))?;
    if !canonical_path.starts_with(&canonical_skills) {
        return Err("Access denied: path is outside skills directory".to_string());
    }
    std::fs::read_to_string(&canonical_path).map_err(|e| format!("Failed to read skill: {e}"))
}
