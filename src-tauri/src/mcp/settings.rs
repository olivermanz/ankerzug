use serde::{Deserialize, Serialize};
use std::{
    fs::{self, File},
    io::{self, Read},
    path::Path,
};

#[derive(Clone, Copy, Default, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub(super) enum AccessMode {
    #[default]
    Read,
    ReadWrite,
}

#[derive(Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct Settings {
    pub(super) enabled: bool,
    pub(super) mode: AccessMode,
    pub(super) authentication: bool,
    pub(super) token: String,
}

impl Default for Settings {
    fn default() -> Self {
        Self {
            enabled: false,
            mode: AccessMode::Read,
            authentication: true,
            token: String::new(),
        }
    }
}

impl Settings {
    pub(super) fn load(path: &Path) -> io::Result<Self> {
        let file = match File::open(path) {
            Ok(file) => file,
            Err(error) if error.kind() == io::ErrorKind::NotFound => return Ok(Self::default()),
            Err(error) => return Err(error),
        };
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            if file.metadata()?.permissions().mode() & 0o077 != 0 {
                return Err(io::ErrorKind::PermissionDenied.into());
            }
        }
        let settings: Self = serde_json::from_reader(file.take(4096))?;
        settings.validate()?;
        Ok(settings)
    }

    pub(super) fn validate(&self) -> io::Result<()> {
        // RFC 6750 b64token, with padding allowed only at the end.
        let token = self.token.trim_end_matches('=');
        let valid = !token.is_empty()
            && self.token.len() <= 512
            && token
                .bytes()
                .all(|byte| byte.is_ascii_alphanumeric() || b"-._~+/".contains(&byte));
        if valid || (self.token.is_empty() && (!self.enabled || !self.authentication)) {
            Ok(())
        } else {
            Err(io::ErrorKind::InvalidData.into())
        }
    }

    pub(super) fn save(&self, path: &Path) -> io::Result<()> {
        let parent = path.parent().expect("MCP settings have a parent directory");
        fs::create_dir_all(parent)?;
        // NamedTempFile creates a mode-0600 file on Unix. On Windows the
        // per-user application data directory supplies the inherited ACL.
        let mut file = tempfile::NamedTempFile::new_in(parent)?;
        serde_json::to_writer(file.as_file_mut(), self)?;
        file.as_file().sync_all()?;
        file.persist(path)?;
        Ok(())
    }
}

pub(super) fn new_token() -> Result<String, String> {
    let mut bytes = [0u8; 32];
    getrandom::fill(&mut bytes).map_err(|_| "Token konnte nicht erzeugt werden.".to_owned())?;
    Ok(bytes.iter().map(|byte| format!("{byte:02x}")).collect())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn defaults_and_private_round_trip() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("mcp.json");
        let mut settings = Settings::load(&path).unwrap();
        assert!(!settings.enabled);
        assert!(settings.authentication);
        assert!(matches!(settings.mode, AccessMode::Read));
        settings.enabled = true;
        assert!(settings.validate().is_err());
        settings.token = new_token().unwrap();
        assert_eq!(settings.token.len(), 64);
        settings.validate().unwrap();
        settings.save(&path).unwrap();
        let loaded = Settings::load(&path).unwrap();
        assert!(loaded.enabled);
        assert_eq!(loaded.token, settings.token);
        settings.token = new_token().unwrap();
        assert_ne!(loaded.token, settings.token);
        settings.save(&path).unwrap();
        assert_eq!(Settings::load(&path).unwrap().token, settings.token);
    }
}
