// File browser commands (Files tab)

#[derive(serde::Serialize)]
pub struct DirEntry {
    pub name: String,
    pub path: String,
    pub is_dir: bool,
    pub size: u64,
    pub ext: String,
}

/// Content types for file viewer routing
#[derive(serde::Serialize)]
#[serde(tag = "type")]
pub enum FileContent {
    Text { content: String, lang: String },
    Binary { message: String },
    TooLarge { size: u64 },
}

#[tauri::command]
pub fn list_directory_children(path: String) -> Result<Vec<DirEntry>, String> {
    let dir = std::path::Path::new(&path);
    if !dir.is_dir() {
        return Err(format!("Not a directory: {path}"));
    }
    let mut entries = Vec::new();
    let read_dir = std::fs::read_dir(dir).map_err(|e| format!("Failed to read directory: {e}"))?;
    for entry in read_dir {
        let entry = entry.map_err(|e| format!("Failed to read entry: {e}"))?;
        let metadata = entry.metadata().map_err(|e| format!("Failed to read metadata: {e}"))?;
        let name = entry.file_name().to_string_lossy().into_owned();
        if name.starts_with('.') {
            continue;
        }
        let is_dir = metadata.is_dir();
        let ext = if is_dir {
            String::new()
        } else {
            std::path::Path::new(&name)
                .extension()
                .map(|e| e.to_string_lossy().to_lowercase())
                .unwrap_or_default()
        };
        entries.push(DirEntry {
            name,
            path: entry.path().to_string_lossy().into_owned(),
            is_dir,
            size: metadata.len(),
            ext,
        });
    }
    entries.sort_by(|a, b| {
        b.is_dir.cmp(&a.is_dir).then_with(|| a.name.to_lowercase().cmp(&b.name.to_lowercase()))
    });
    Ok(entries)
}

#[tauri::command]
pub fn read_file_content(path: String) -> Result<FileContent, String> {
    let file_path = std::path::Path::new(&path);
    if !file_path.is_file() {
        return Err(format!("Not a file: {path}"));
    }
    let metadata = std::fs::metadata(&path).map_err(|e| format!("Failed to read metadata: {e}"))?;
    let size = metadata.len();

    if size > 10 * 1024 * 1024 {
        return Ok(FileContent::TooLarge { size });
    }

    let ext = file_path
        .extension()
        .map(|e| e.to_string_lossy().to_lowercase())
        .unwrap_or_default();

    let binary_exts = ["png", "jpg", "jpeg", "gif", "webp", "svg", "ico", "bmp",
                       "pdf", "zip", "tar", "gz", "7z", "rar",
                       "mp3", "mp4", "wav", "ogg", "webm", "avi",
                       "woff", "woff2", "ttf", "otf", "eot",
                       "exe", "dll", "so", "dylib", "wasm"];
    if binary_exts.contains(&ext.as_str()) {
        return Ok(FileContent::Binary { message: format!("Binary file ({ext}), {size} bytes") });
    }

    let content = std::fs::read_to_string(&path)
        .map_err(|_| format!("Binary or non-UTF-8 file"))?;

    let lang = match ext.as_str() {
        "rs" => "rust",
        "ts" | "tsx" => "typescript",
        "js" | "jsx" | "mjs" | "cjs" => "javascript",
        "py" => "python",
        "svelte" => "svelte",
        "html" | "htm" => "html",
        "css" | "scss" | "less" => "css",
        "json" => "json",
        "toml" => "toml",
        "yaml" | "yml" => "yaml",
        "md" | "markdown" => "markdown",
        "sh" | "bash" | "zsh" => "bash",
        "sql" => "sql",
        "xml" => "xml",
        "csv" => "csv",
        "dockerfile" => "dockerfile",
        "lock" => "text",
        _ => "text",
    }.to_string();

    Ok(FileContent::Text { content, lang })
}

#[tauri::command]
pub fn write_file_content(path: String, content: String) -> Result<(), String> {
    let file_path = std::path::Path::new(&path);
    if !file_path.is_file() {
        return Err(format!("Not an existing file: {path}"));
    }
    std::fs::write(&path, content.as_bytes())
        .map_err(|e| format!("Failed to write file: {e}"))
}

#[tauri::command]
pub async fn pick_directory(window: tauri::Window) -> Result<Option<String>, String> {
    let dialog = rfd::AsyncFileDialog::new()
        .set_title("Select Directory")
        .set_parent(&window);
    let folder = dialog.pick_folder().await;
    Ok(folder.map(|f| f.path().to_string_lossy().into_owned()))
}
