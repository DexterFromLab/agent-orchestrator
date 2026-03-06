// Thin wrapper — re-exports bterminal_core::pty types.
// PtyManager is now in bterminal-core; this module only re-exports for lib.rs.

pub use bterminal_core::pty::{PtyManager, PtyOptions};
