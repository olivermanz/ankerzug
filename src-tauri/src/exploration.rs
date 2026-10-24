//! Only compiled into explicitly instrumented builds. Never use the trainer's database.
use std::{io, path::PathBuf};

fn validate_directory(value: Option<std::ffi::OsString>) -> io::Result<PathBuf> {
    let path = value.map(PathBuf::from).ok_or_else(|| {
        io::Error::other("ANKERZUG_EXPLORATION_DIR is required for exploration builds")
    })?;
    if !path.is_absolute() || path.parent().is_none() {
        return Err(io::Error::other(
            "ANKERZUG_EXPLORATION_DIR must be an absolute, dedicated directory",
        ));
    }
    Ok(path)
}

pub fn directory() -> io::Result<PathBuf> {
    validate_directory(std::env::var_os("ANKERZUG_EXPLORATION_DIR"))
}

fn validate_port(value: Option<String>) -> io::Result<u16> {
    value
        .and_then(|value| value.parse::<u16>().ok())
        .filter(|port| *port > 0)
        .ok_or_else(|| io::Error::other("ANKERZUG_EXPLORATION_PORT must be between 1 and 65535"))
}

pub fn port() -> io::Result<u16> {
    validate_port(std::env::var("ANKERZUG_EXPLORATION_PORT").ok())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn requires_an_explicit_nonzero_port() {
        for value in [None, Some(""), Some("0"), Some("65536"), Some("abc")] {
            assert!(validate_port(value.map(str::to_owned)).is_err());
        }
        assert_eq!(validate_port(Some("4445".into())).unwrap(), 4445);
    }

    #[test]
    fn never_falls_back_to_the_normal_workspace() {
        assert!(validate_directory(None).is_err());
        assert!(validate_directory(Some("".into())).is_err());
        assert!(validate_directory(Some("relative".into())).is_err());
        let dedicated = std::env::temp_dir().join("ankerzug-exploration-test");
        assert_eq!(
            validate_directory(Some(dedicated.clone().into_os_string())).unwrap(),
            dedicated
        );
    }
}
