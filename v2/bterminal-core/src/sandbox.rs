// Landlock-based filesystem sandboxing for sidecar processes.
//
// Landlock is a Linux Security Module (LSM) available since kernel 5.13.
// It restricts filesystem access for the calling process and all its children.
// Applied via pre_exec() on the sidecar child process before exec.
//
// Restrictions can only be tightened after application — never relaxed.
// The sidecar is long-lived and handles queries for multiple projects,
// so we apply the union of all project paths at sidecar start time.

use std::path::PathBuf;

use landlock::{
    Access, AccessFs, PathBeneath, PathFd, Ruleset, RulesetAttr, RulesetCreatedAttr,
    RulesetStatus, ABI,
};

/// Target Landlock ABI version. V3 requires kernel 6.2+ (we run 6.12+).
/// Falls back gracefully on older kernels via best-effort mode.
const TARGET_ABI: ABI = ABI::V3;

/// Configuration for Landlock filesystem sandboxing.
#[derive(Debug, Clone)]
pub struct SandboxConfig {
    /// Directories with full read+write+execute access (project CWDs, worktrees, tmp)
    pub rw_paths: Vec<PathBuf>,
    /// Directories with read-only access (system libs, runtimes, config)
    pub ro_paths: Vec<PathBuf>,
    /// Whether sandboxing is enabled
    pub enabled: bool,
}

impl Default for SandboxConfig {
    fn default() -> Self {
        Self {
            rw_paths: Vec::new(),
            ro_paths: Vec::new(),
            enabled: false,
        }
    }
}

impl SandboxConfig {
    /// Build a sandbox config for a set of project directories.
    ///
    /// `project_cwds` — directories that need read+write access (one per project).
    /// `worktree_roots` — optional worktree directories (one per project that uses worktrees).
    ///
    /// System paths (runtimes, libraries, /etc) are added as read-only automatically.
    pub fn for_projects(project_cwds: &[&str], worktree_roots: &[&str]) -> Self {
        let mut rw = Vec::new();

        for cwd in project_cwds {
            rw.push(PathBuf::from(cwd));
        }
        for wt in worktree_roots {
            rw.push(PathBuf::from(wt));
        }

        // Temp dir for sidecar scratch files
        rw.push(std::env::temp_dir());

        let home = dirs::home_dir().unwrap_or_else(|| PathBuf::from("/root"));

        let ro = vec![
            PathBuf::from("/usr"),     // system binaries + libraries
            PathBuf::from("/lib"),     // shared libraries
            PathBuf::from("/lib64"),   // 64-bit shared libraries
            PathBuf::from("/etc"),     // system configuration (read only)
            PathBuf::from("/proc"),    // process info (Landlock V3+ handles this)
            PathBuf::from("/dev"),     // device nodes (stdin/stdout/stderr, /dev/null, urandom)
            PathBuf::from("/bin"),     // essential binaries (symlink to /usr/bin on most distros)
            PathBuf::from("/sbin"),    // essential system binaries
            home.join(".local"),       // ~/.local/bin (claude CLI, user-installed tools)
            home.join(".deno"),        // Deno runtime cache
            home.join(".nvm"),         // Node.js version manager
            home.join(".config"),      // XDG config (claude profiles, bterminal config)
            home.join(".claude"),      // Claude CLI data (worktrees, skills, settings)
        ];

        Self {
            rw_paths: rw,
            ro_paths: ro,
            enabled: true,
        }
    }

    /// Build a sandbox config for a single project directory.
    pub fn for_project(cwd: &str, worktree: Option<&str>) -> Self {
        let worktrees: Vec<&str> = worktree.into_iter().collect();
        Self::for_projects(&[cwd], &worktrees)
    }

    /// Apply Landlock restrictions to the current process.
    ///
    /// This must be called in the child process (e.g., via `pre_exec`) BEFORE exec.
    /// Once applied, restrictions are inherited by all child processes and cannot be relaxed.
    ///
    /// Returns:
    /// - `Ok(true)` if Landlock was applied and enforced
    /// - `Ok(false)` if the kernel does not support Landlock (graceful degradation)
    /// - `Err(msg)` on configuration or syscall errors
    pub fn apply(&self) -> Result<bool, String> {
        if !self.enabled {
            return Ok(false);
        }

        let access_all = AccessFs::from_all(TARGET_ABI);
        let access_read = AccessFs::from_read(TARGET_ABI);

        // Create ruleset handling all filesystem access types
        let mut ruleset = Ruleset::default()
            .handle_access(access_all)
            .map_err(|e| format!("Landlock: failed to handle access: {e}"))?
            .create()
            .map_err(|e| format!("Landlock: failed to create ruleset: {e}"))?;

        // Add read+write rules for project directories and tmp
        for path in &self.rw_paths {
            if path.exists() {
                let fd = PathFd::new(path)
                    .map_err(|e| format!("Landlock: PathFd failed for {}: {e}", path.display()))?;
                ruleset = ruleset
                    .add_rule(PathBeneath::new(fd, access_all))
                    .map_err(|e| {
                        format!("Landlock: add_rule (rw) failed for {}: {e}", path.display())
                    })?;
            } else {
                log::warn!(
                    "Landlock: skipping non-existent rw path: {}",
                    path.display()
                );
            }
        }

        // Add read-only rules for system paths
        for path in &self.ro_paths {
            if path.exists() {
                let fd = PathFd::new(path)
                    .map_err(|e| format!("Landlock: PathFd failed for {}: {e}", path.display()))?;
                ruleset = ruleset
                    .add_rule(PathBeneath::new(fd, access_read))
                    .map_err(|e| {
                        format!("Landlock: add_rule (ro) failed for {}: {e}", path.display())
                    })?;
            }
            // Silently skip non-existent read-only paths (e.g., /lib64 on some systems)
        }

        // Enforce the ruleset on this thread (and inherited by children)
        let status = ruleset
            .restrict_self()
            .map_err(|e| format!("Landlock: restrict_self failed: {e}"))?;

        // Landlock enforcement states:
        // - Enforced: kernel 6.2+ with ABI V3 (full filesystem restriction)
        // - NotEnforced: kernel 5.13–6.1 (Landlock exists but ABI too old for V3)
        // - Error (caught above): kernel <5.13 (no Landlock LSM available)
        let enforced = status.ruleset != RulesetStatus::NotEnforced;
        if enforced {
            log::info!("Landlock sandbox applied ({} rw, {} ro paths)", self.rw_paths.len(), self.ro_paths.len());
        } else {
            log::warn!(
                "Landlock not enforced — sidecar runs without filesystem restrictions. \
                 Kernel 6.2+ required for enforcement."
            );
        }

        Ok(enforced)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_default_is_disabled() {
        let config = SandboxConfig::default();
        assert!(!config.enabled);
        assert!(config.rw_paths.is_empty());
        assert!(config.ro_paths.is_empty());
    }

    #[test]
    fn test_for_project_single_cwd() {
        let config = SandboxConfig::for_project("/home/user/myproject", None);
        assert!(config.enabled);
        assert!(config.rw_paths.contains(&PathBuf::from("/home/user/myproject")));
        assert!(config.rw_paths.contains(&std::env::temp_dir()));
        // No worktree path added
        assert!(!config
            .rw_paths
            .iter()
            .any(|p| p.to_string_lossy().contains("worktree")));
    }

    #[test]
    fn test_for_project_with_worktree() {
        let config = SandboxConfig::for_project(
            "/home/user/myproject",
            Some("/home/user/myproject/.claude/worktrees/abc123"),
        );
        assert!(config.enabled);
        assert!(config.rw_paths.contains(&PathBuf::from("/home/user/myproject")));
        assert!(config.rw_paths.contains(&PathBuf::from(
            "/home/user/myproject/.claude/worktrees/abc123"
        )));
    }

    #[test]
    fn test_for_projects_multiple_cwds() {
        let config = SandboxConfig::for_projects(
            &["/home/user/project-a", "/home/user/project-b"],
            &["/home/user/project-a/.claude/worktrees/s1"],
        );
        assert!(config.enabled);
        assert!(config.rw_paths.contains(&PathBuf::from("/home/user/project-a")));
        assert!(config.rw_paths.contains(&PathBuf::from("/home/user/project-b")));
        assert!(config.rw_paths.contains(&PathBuf::from(
            "/home/user/project-a/.claude/worktrees/s1"
        )));
        // tmp always present
        assert!(config.rw_paths.contains(&std::env::temp_dir()));
    }

    #[test]
    fn test_ro_paths_include_system_dirs() {
        let config = SandboxConfig::for_project("/tmp/test", None);
        let ro_strs: Vec<String> = config.ro_paths.iter().map(|p| p.display().to_string()).collect();

        assert!(ro_strs.iter().any(|p| p == "/usr"), "missing /usr");
        assert!(ro_strs.iter().any(|p| p == "/lib"), "missing /lib");
        assert!(ro_strs.iter().any(|p| p == "/etc"), "missing /etc");
        assert!(ro_strs.iter().any(|p| p == "/proc"), "missing /proc");
        assert!(ro_strs.iter().any(|p| p == "/dev"), "missing /dev");
        assert!(ro_strs.iter().any(|p| p == "/bin"), "missing /bin");
    }

    #[test]
    fn test_ro_paths_include_runtime_dirs() {
        let config = SandboxConfig::for_project("/tmp/test", None);
        let home = dirs::home_dir().unwrap();

        assert!(config.ro_paths.contains(&home.join(".local")));
        assert!(config.ro_paths.contains(&home.join(".deno")));
        assert!(config.ro_paths.contains(&home.join(".nvm")));
        assert!(config.ro_paths.contains(&home.join(".config")));
        assert!(config.ro_paths.contains(&home.join(".claude")));
    }

    #[test]
    fn test_disabled_apply_returns_false() {
        let config = SandboxConfig::default();
        assert_eq!(config.apply().unwrap(), false);
    }

    #[test]
    fn test_rw_paths_count() {
        // Single project: cwd + tmp = 2
        let config = SandboxConfig::for_project("/tmp/test", None);
        assert_eq!(config.rw_paths.len(), 2);

        // With worktree: cwd + worktree + tmp = 3
        let config = SandboxConfig::for_project("/tmp/test", Some("/tmp/wt"));
        assert_eq!(config.rw_paths.len(), 3);
    }

    #[test]
    fn test_for_projects_empty() {
        let config = SandboxConfig::for_projects(&[], &[]);
        assert!(config.enabled);
        // Only tmp dir in rw
        assert_eq!(config.rw_paths.len(), 1);
        assert_eq!(config.rw_paths[0], std::env::temp_dir());
    }
}
