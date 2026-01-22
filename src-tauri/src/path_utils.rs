
pub fn construct_robust_path(current_path: &str) -> String {
    let mut paths: Vec<String> = std::env::split_paths(current_path)
        .map(|p| p.to_string_lossy().to_string())
        .collect();

    let mut common_paths = Vec::new();

    if cfg!(target_os = "macos") || cfg!(target_os = "linux") {
        common_paths.extend(vec![
            "/opt/homebrew/bin".to_string(), // Apple Silicon
            "/usr/local/bin".to_string(),    // Intel Mac / Linux
            "/usr/bin".to_string(),
            "/bin".to_string(),
            "/usr/sbin".to_string(),
            "/sbin".to_string(),
        ]);
        
        // Add ~/.local/bin if HOME is set
        if let Ok(home) = std::env::var("HOME") {
            common_paths.push(format!("{}/.local/bin", home));
        }
    } else if cfg!(target_os = "windows") {
        // Common Windows package manager paths
        if let Ok(user_profile) = std::env::var("USERPROFILE") {
            common_paths.push(format!("{}\\scoop\\shims", user_profile));
            common_paths.push(format!("{}\\AppData\\Local\\Microsoft\\WindowsApps", user_profile));
        }
        if let Ok(program_data) = std::env::var("ProgramData") {
            common_paths.push(format!("{}\\chocolatey\\bin", program_data));
        }
    }

    for p in common_paths {
        if !paths.iter().any(|existing| *existing == p) {
            paths.push(p);
        }
    }
    
    std::env::join_paths(paths)
        .map(|s| s.to_string_lossy().to_string())
        .unwrap_or_else(|_| current_path.to_string())
}
