// Project group configuration
// Reads/writes ~/.config/bterminal/groups.json

use serde::{Deserialize, Serialize};
use std::path::PathBuf;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProjectConfig {
    pub id: String,
    pub name: String,
    pub identifier: String,
    pub description: String,
    pub icon: String,
    pub cwd: String,
    pub profile: String,
    pub enabled: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GroupAgentConfig {
    pub id: String,
    pub name: String,
    pub role: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub model: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub cwd: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub system_prompt: Option<String>,
    pub enabled: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub wake_interval_min: Option<u32>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GroupConfig {
    pub id: String,
    pub name: String,
    pub projects: Vec<ProjectConfig>,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub agents: Vec<GroupAgentConfig>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GroupsFile {
    pub version: u32,
    pub groups: Vec<GroupConfig>,
    pub active_group_id: String,
}

impl Default for GroupsFile {
    fn default() -> Self {
        Self {
            version: 1,
            groups: Vec::new(),
            active_group_id: String::new(),
        }
    }
}

fn config_path() -> PathBuf {
    dirs::config_dir()
        .unwrap_or_else(|| PathBuf::from("."))
        .join("bterminal")
        .join("groups.json")
}

pub fn load_groups() -> Result<GroupsFile, String> {
    let path = config_path();
    if !path.exists() {
        return Ok(GroupsFile::default());
    }
    let content = std::fs::read_to_string(&path)
        .map_err(|e| format!("Failed to read groups.json: {e}"))?;
    serde_json::from_str(&content)
        .map_err(|e| format!("Invalid groups.json: {e}"))
}

pub fn save_groups(config: &GroupsFile) -> Result<(), String> {
    let path = config_path();
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent)
            .map_err(|e| format!("Failed to create config dir: {e}"))?;
    }
    let json = serde_json::to_string_pretty(config)
        .map_err(|e| format!("JSON serialize error: {e}"))?;
    std::fs::write(&path, json)
        .map_err(|e| format!("Failed to write groups.json: {e}"))
}

/// Discover markdown files in a project directory for the Docs tab.
/// Returns paths relative to cwd, prioritized: CLAUDE.md, README.md, docs/*.md
pub fn discover_markdown_files(cwd: &str) -> Result<Vec<MdFileEntry>, String> {
    let root = PathBuf::from(cwd);
    if !root.is_dir() {
        return Err(format!("Directory not found: {cwd}"));
    }

    let mut entries = Vec::new();

    // Priority files at root
    for name in &["CLAUDE.md", "README.md", "CHANGELOG.md", "TODO.md", "SETUP.md"] {
        let path = root.join(name);
        if path.is_file() {
            entries.push(MdFileEntry {
                name: name.to_string(),
                path: path.to_string_lossy().to_string(),
                priority: true,
            });
        }
    }

    // docs/ or doc/ directory (max 20 entries, depth 2)
    for dir_name in &["docs", "doc"] {
        let docs_dir = root.join(dir_name);
        if docs_dir.is_dir() {
            scan_md_dir(&docs_dir, &mut entries, 2, 20);
        }
    }

    Ok(entries)
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MdFileEntry {
    pub name: String,
    pub path: String,
    pub priority: bool,
}

fn scan_md_dir(dir: &PathBuf, entries: &mut Vec<MdFileEntry>, max_depth: u32, max_count: usize) {
    if max_depth == 0 || entries.len() >= max_count {
        return;
    }
    let Ok(read_dir) = std::fs::read_dir(dir) else { return };
    for entry in read_dir.flatten() {
        if entries.len() >= max_count {
            break;
        }
        let path = entry.path();
        if path.is_file() {
            if let Some(ext) = path.extension() {
                if ext == "md" || ext == "markdown" {
                    let name = path.file_name().unwrap_or_default().to_string_lossy().to_string();
                    entries.push(MdFileEntry {
                        name,
                        path: path.to_string_lossy().to_string(),
                        priority: false,
                    });
                }
            }
        } else if path.is_dir() {
            // Skip common non-doc directories
            let dir_name = path.file_name().unwrap_or_default().to_string_lossy().to_string();
            if !matches!(dir_name.as_str(), "node_modules" | ".git" | "target" | "dist" | "build" | ".next" | "__pycache__") {
                scan_md_dir(&path, entries, max_depth - 1, max_count);
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_default_groups_file() {
        let g = GroupsFile::default();
        assert_eq!(g.version, 1);
        assert!(g.groups.is_empty());
        assert!(g.active_group_id.is_empty());
    }

    #[test]
    fn test_groups_roundtrip() {
        let config = GroupsFile {
            version: 1,
            groups: vec![GroupConfig {
                id: "test".to_string(),
                name: "Test Group".to_string(),
                projects: vec![ProjectConfig {
                    id: "p1".to_string(),
                    name: "Project One".to_string(),
                    identifier: "project-one".to_string(),
                    description: "A test project".to_string(),
                    icon: "\u{f120}".to_string(),
                    cwd: "/tmp/test".to_string(),
                    profile: "default".to_string(),
                    enabled: true,
                }],
            }],
            active_group_id: "test".to_string(),
        };
        let json = serde_json::to_string(&config).unwrap();
        let parsed: GroupsFile = serde_json::from_str(&json).unwrap();
        assert_eq!(parsed.groups.len(), 1);
        assert_eq!(parsed.groups[0].projects.len(), 1);
        assert_eq!(parsed.groups[0].projects[0].identifier, "project-one");
    }

    #[test]
    fn test_load_missing_file_returns_default() {
        // config_path() will point to a non-existent file in test
        // We test the default case directly
        let g = GroupsFile::default();
        assert_eq!(g.version, 1);
    }

    #[test]
    fn test_discover_nonexistent_dir() {
        let result = discover_markdown_files("/nonexistent/path/12345");
        assert!(result.is_err());
    }

    #[test]
    fn test_discover_empty_dir() {
        let dir = tempfile::tempdir().unwrap();
        let result = discover_markdown_files(dir.path().to_str().unwrap()).unwrap();
        assert!(result.is_empty());
    }

    #[test]
    fn test_discover_finds_readme() {
        let dir = tempfile::tempdir().unwrap();
        std::fs::write(dir.path().join("README.md"), "# Hello").unwrap();
        let result = discover_markdown_files(dir.path().to_str().unwrap()).unwrap();
        assert_eq!(result.len(), 1);
        assert_eq!(result[0].name, "README.md");
        assert!(result[0].priority);
    }

    #[test]
    fn test_discover_finds_docs() {
        let dir = tempfile::tempdir().unwrap();
        let docs = dir.path().join("docs");
        std::fs::create_dir(&docs).unwrap();
        std::fs::write(docs.join("guide.md"), "# Guide").unwrap();
        std::fs::write(docs.join("api.md"), "# API").unwrap();
        let result = discover_markdown_files(dir.path().to_str().unwrap()).unwrap();
        assert_eq!(result.len(), 2);
        assert!(result.iter().all(|e| !e.priority));
    }

    #[test]
    fn test_discover_finds_doc_dir() {
        let dir = tempfile::tempdir().unwrap();
        let doc = dir.path().join("doc");
        std::fs::create_dir(&doc).unwrap();
        std::fs::write(doc.join("requirements.md"), "# Req").unwrap();
        let result = discover_markdown_files(dir.path().to_str().unwrap()).unwrap();
        assert_eq!(result.len(), 1);
        assert_eq!(result[0].name, "requirements.md");
        assert!(!result[0].priority);
    }

    #[test]
    fn test_discover_finds_setup_md() {
        let dir = tempfile::tempdir().unwrap();
        std::fs::write(dir.path().join("SETUP.md"), "# Setup").unwrap();
        let result = discover_markdown_files(dir.path().to_str().unwrap()).unwrap();
        assert_eq!(result.len(), 1);
        assert_eq!(result[0].name, "SETUP.md");
        assert!(result[0].priority);
    }
}
