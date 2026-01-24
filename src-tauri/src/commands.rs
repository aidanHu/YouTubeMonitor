// This file is now a facade for the modularized backend logic.
// All logic has been moved to src/modules/*.rs

// Re-export models so `lib.rs` (and legacy calls) can find `commands::Video`, `commands::DownloadState`, etc.
pub use crate::models::*;

// Re-export all logic from modules
pub use crate::modules::download::*;
pub use crate::modules::video::*;
pub use crate::modules::channel::*;
pub use crate::modules::group::*;
pub use crate::modules::settings::*;
pub use crate::modules::common::*;
pub use crate::modules::stats::*;
pub use crate::modules::backup::*;
