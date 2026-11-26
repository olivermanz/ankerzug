use crate::{
    games::ATTACHMENT_LIMIT,
    models::{Backup, Workspace},
    storage::{CONTENT_PDF_LIMIT, Result, attachment_index, invalid, validate},
};
use serde::Serialize;
use std::{
    collections::HashMap,
    fmt::Write as _,
    fs::File,
    io::{Read, Seek, SeekFrom, Write},
    path::Path,
};
use zip::{CompressionMethod, ZipArchive, ZipWriter, write::SimpleFileOptions};

const MANIFEST: &str = "backup.json";
const JSON_LIMIT: u64 = 200 * 1024 * 1024;
const PDF_TOTAL_LIMIT: u64 = 4 * 1024 * 1024 * 1024;
const FILE_LIMIT: u64 = PDF_TOTAL_LIMIT + JSON_LIMIT + 64 * 1024 * 1024;
const MAX_ATTACHMENTS: usize = 20_000;

fn zip_error(error: zip::result::ZipError) -> crate::storage::AppError {
    invalid(&format!(
        "Ungültiges oder nicht lesbares ZIP-Backup: {error}"
    ))
}

fn entry_name(id: &str) -> String {
    // IDs from older workspaces can contain arbitrary UTF-8. Hex gives an
    // unambiguous ASCII name without path separators or case collisions.
    let mut name = String::from("attachments/");
    for byte in id.bytes() {
        write!(name, "{byte:02x}").unwrap();
    }
    name.push_str(".pdf");
    name
}

fn check_pdf_total(total: u64) -> Result<()> {
    if total > PDF_TOTAL_LIMIT {
        return Err(invalid(
            "PDF-Anlagen im Backup dürfen zusammen höchstens 4 GiB groß sein.",
        ));
    }
    Ok(())
}

fn check_count(count: usize) -> Result<()> {
    if count > MAX_ATTACHMENTS {
        return Err(invalid("Das Backup enthält mehr als 20.000 PDF-Anlagen."));
    }
    Ok(())
}

fn pdf_limit(content: bool) -> usize {
    if content {
        CONTENT_PDF_LIMIT
    } else {
        ATTACHMENT_LIMIT
    }
}

fn validate_pdf(filename: &str, content: bool, bytes: &[u8]) -> Result<()> {
    if content {
        crate::storage::validate_content_pdf(filename, bytes)
    } else {
        crate::games::validate_attachment(filename, bytes)
    }
}

pub(crate) fn write_zip(
    path: &Path,
    workspace: Workspace,
    mut read: impl FnMut(&str) -> Result<Vec<u8>>,
) -> Result<()> {
    if !path
        .file_name()
        .and_then(|name| name.to_str())
        .is_some_and(|name| name.to_ascii_lowercase().ends_with(".ankerzug.zip"))
    {
        return Err(invalid(
            "Bitte eine Zieldatei mit der Endung .ankerzug.zip wählen.",
        ));
    }
    let manifest = Backup {
        format_version: 3,
        workspace,
    };
    let attachments = attachment_index(&manifest.workspace);
    check_count(attachments.len())?;
    let json = serde_json::to_vec(&manifest).map_err(|error| invalid(&error.to_string()))?;
    if json.len() as u64 > JSON_LIMIT {
        return Err(invalid("Das Backup-Manifest ist größer als 200 MiB."));
    }
    let parent = path
        .parent()
        .filter(|path| !path.as_os_str().is_empty())
        .unwrap_or(Path::new("."));
    let mut temporary = tempfile::NamedTempFile::new_in(parent)?;
    let mut archive = ZipWriter::new(temporary.as_file_mut());
    let options = SimpleFileOptions::default().compression_method(CompressionMethod::Deflated);
    archive.start_file(MANIFEST, options).map_err(zip_error)?;
    archive.write_all(&json)?;
    drop(json);
    let mut total = 0;
    for (id, (filename, content)) in attachments {
        let bytes = read(id)?;
        validate_pdf(filename, content, &bytes)?;
        total += bytes.len() as u64;
        check_pdf_total(total)?;
        archive
            .start_file(entry_name(id), options)
            .map_err(zip_error)?;
        archive.write_all(&bytes)?;
    }
    archive.finish().map_err(zip_error)?.sync_all()?;
    temporary.persist(path).map_err(|error| error.error)?;
    Ok(())
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct PdfReference {
    id: String,
    filename: String,
    content: bool,
}

#[derive(Serialize)]
#[serde(tag = "kind", rename_all = "camelCase")]
pub(crate) enum BackupSelection {
    Legacy {
        contents: String,
    },
    Zip {
        token: u64,
        cycles: usize,
        templates: usize,
        games: usize,
        pdfs: Vec<PdfReference>,
    },
}

pub(crate) enum SelectedBackup {
    Legacy(String),
    Zip(Box<PreparedZip>),
}

pub(crate) fn open_backup(path: &Path) -> Result<SelectedBackup> {
    let mut file = File::open(path)?;
    let mut signature = [0; 4];
    let length = file.read(&mut signature)?;
    file.rewind()?;
    if length == signature.len() && matches!(&signature, b"PK\x03\x04" | b"PK\x05\x06") {
        if file.metadata()?.len() > FILE_LIMIT {
            return Err(invalid("Die Backup-Datei ist zu groß."));
        }
        return PreparedZip::open(file).map(|zip| SelectedBackup::Zip(Box::new(zip)));
    }
    let mut contents = String::new();
    file.take(JSON_LIMIT + 1).read_to_string(&mut contents)?;
    if contents.len() as u64 > JSON_LIMIT {
        return Err(invalid("Das JSON-Backup ist größer als 200 MiB."));
    }
    if contents.starts_with('\u{feff}') {
        contents.drain(..'\u{feff}'.len_utf8());
    }
    Ok(SelectedBackup::Legacy(contents))
}

fn read_entry(archive: &mut ZipArchive<File>, name: &str, limit: u64) -> Result<Vec<u8>> {
    let entry = archive.by_name(name).map_err(zip_error)?;
    if entry.size() > limit {
        return Err(invalid("Ein Eintrag im ZIP-Backup ist zu groß."));
    }
    let size = entry.size();
    let mut bytes = Vec::new();
    entry
        .take(limit + 1)
        .read_to_end(&mut bytes)
        .map_err(|error| invalid(&format!("Beschädigter ZIP-Eintrag: {error}")))?;
    if bytes.len() as u64 != size || bytes.len() as u64 > limit {
        return Err(invalid("Ungültige Größe eines ZIP-Eintrags."));
    }
    Ok(bytes)
}

pub(crate) struct PreparedZip {
    archive: ZipArchive<File>,
    workspace: Workspace,
    pdfs: Vec<PdfReference>,
    index: HashMap<String, usize>,
    staged: File,
    offsets: HashMap<String, (u64, usize)>,
    staged_size: u64,
}

impl PreparedZip {
    fn open(file: File) -> Result<Self> {
        let mut archive = ZipArchive::new(file).map_err(zip_error)?;
        check_count(archive.len().saturating_sub(1))?;
        let json = read_entry(&mut archive, MANIFEST, JSON_LIMIT)?;
        let manifest: Backup = serde_json::from_slice(&json)
            .map_err(|error| invalid(&format!("Ungültiges Backup-Manifest: {error}")))?;
        drop(json);
        if manifest.format_version != 3 {
            return Err(invalid("Nicht unterstützte ZIP-Backupversion."));
        }
        let workspace = manifest.workspace;
        if crate::storage::has_inline_attachments(&workspace) {
            return Err(invalid(
                "Das ZIP-Manifest darf keine eingebetteten PDF-Daten enthalten.",
            ));
        }
        validate(&workspace)?;
        let attachments = attachment_index(&workspace);
        check_count(attachments.len())?;
        let mut expected: HashMap<_, _> = attachments
            .iter()
            .map(|(id, (_, content))| (entry_name(id), pdf_limit(*content) as u64))
            .collect();
        expected.insert(MANIFEST.to_owned(), JSON_LIMIT);
        let mut total = 0;
        for number in 0..archive.len() {
            let entry = archive.by_index(number).map_err(zip_error)?;
            let name = entry.name().map_err(zip_error)?;
            let limit = expected
                .remove(name.as_ref())
                .ok_or_else(|| invalid("Unerwarteter oder doppelter ZIP-Eintrag."))?;
            if !entry.is_file()
                || entry.encrypted()
                || entry.size() > limit
                || !matches!(
                    entry.compression(),
                    CompressionMethod::Deflated | CompressionMethod::Stored
                )
            {
                return Err(invalid("Ungültiger ZIP-Eintrag im Backup."));
            }
            if name != MANIFEST {
                total += entry.size();
                check_pdf_total(total)?;
            }
        }
        if !expected.is_empty() {
            return Err(invalid("Mindestens eine PDF-Anlage fehlt im ZIP-Backup."));
        }
        let mut pdfs: Vec<_> = attachments
            .into_iter()
            .map(|(id, (filename, content))| PdfReference {
                id: id.to_owned(),
                filename: filename.to_owned(),
                content,
            })
            .collect();
        pdfs.sort_unstable_by(|a, b| a.id.cmp(&b.id));
        let index = pdfs
            .iter()
            .enumerate()
            .map(|(i, pdf)| (pdf.id.clone(), i))
            .collect();
        Ok(Self {
            archive,
            workspace,
            pdfs,
            index,
            staged: tempfile::tempfile()?,
            offsets: HashMap::new(),
            staged_size: 0,
        })
    }

    pub(crate) fn preview(&self, token: u64) -> BackupSelection {
        BackupSelection::Zip {
            token,
            cycles: self.workspace.cycles.len(),
            templates: self.workspace.templates.len(),
            games: self.workspace.games.len(),
            pdfs: self.pdfs.clone(),
        }
    }

    pub(crate) fn stage_pdf(&mut self, id: &str) -> Result<Vec<u8>> {
        let pdf = self
            .index
            .get(id)
            .map(|&i| &self.pdfs[i])
            .ok_or_else(|| invalid("Unbekannte PDF-Anlage im Backup."))?;
        if self.offsets.contains_key(id) {
            return read_staged(&mut self.staged, &self.offsets, id);
        }
        let bytes = read_entry(
            &mut self.archive,
            &entry_name(id),
            pdf_limit(pdf.content) as u64,
        )?;
        validate_pdf(&pdf.filename, pdf.content, &bytes)?;
        let end = self.staged_size + bytes.len() as u64;
        check_pdf_total(end)?;
        self.staged.seek(SeekFrom::Start(self.staged_size))?;
        self.staged.write_all(&bytes)?;
        self.offsets
            .insert(id.to_owned(), (self.staged_size, bytes.len()));
        self.staged_size = end;
        Ok(bytes)
    }

    pub(crate) fn restore(
        self,
        store: &mut crate::storage::Store,
        expected_revision: u64,
    ) -> Result<crate::models::Snapshot> {
        let Self {
            workspace,
            mut staged,
            offsets,
            pdfs,
            ..
        } = self;
        if offsets.len() != pdfs.len() {
            return Err(invalid(
                "PDF-Anlagen im Backup wurden noch nicht vollständig gelesen.",
            ));
        }
        store.restore_detached(workspace, expected_revision, |id| {
            read_staged(&mut staged, &offsets, id)
        })
    }
}

fn read_staged(
    file: &mut File,
    offsets: &HashMap<String, (u64, usize)>,
    id: &str,
) -> Result<Vec<u8>> {
    let &(offset, size) = offsets
        .get(id)
        .ok_or_else(|| invalid("PDF-Anlage fehlt im vorbereiteten Backup."))?;
    let mut bytes = vec![0; size];
    file.seek(SeekFrom::Start(offset))?;
    file.read_exact(&mut bytes)?;
    Ok(bytes)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::{models::GameAttachment, storage::Store};

    const LEGACY: &str = include_str!("../../fixtures/workspace-v2.json");
    const PDF: &[u8] = b"%PDF-1.7\n%%EOF";
    const ID: &str = "../geteilt/A";

    fn fixture() -> Workspace {
        let mut workspace = serde_json::from_str::<Backup>(LEGACY).unwrap().workspace;
        let attachment = GameAttachment {
            id: ID.into(),
            filename: "Anlage.pdf".into(),
            bytes: None,
        };
        workspace.cycles[0].sessions[0].contents[0].attachment = Some(attachment.clone());
        workspace.templates[0].contents[0].attachment = Some(attachment);
        workspace
    }

    fn prepared(path: &Path) -> Box<PreparedZip> {
        let SelectedBackup::Zip(zip) = open_backup(path).unwrap() else {
            panic!("Expected ZIP")
        };
        zip
    }

    #[test]
    fn zip_round_trip_reopens_the_database_and_recovers_previous_attachments() {
        let folder = tempfile::tempdir().unwrap();
        let path = folder.path().join("training.ankerzug.zip");
        let database = folder.path().join("restored.sqlite3");
        let mut source = Store::open(Path::new(":memory:")).unwrap();
        source
            .restore_detached(fixture(), 0, |_| Ok(PDF.to_vec()))
            .unwrap();
        source.export_backup(&path).unwrap();

        let mut zip = prepared(&path);
        assert_eq!(zip.archive.len(), 2, "shared PDF is written once");
        assert_eq!(
            zip.archive.by_name(MANIFEST).unwrap().compression(),
            CompressionMethod::Deflated
        );
        assert_eq!(zip.pdfs[0].filename, "Anlage.pdf");
        assert!(!entry_name(ID).contains("../"));
        assert_eq!(zip.stage_pdf(ID).unwrap(), PDF);

        let mut restored = Store::open(&database).unwrap();
        let previous_pdf = b"%PDF-1.7\nprevious\n%%EOF";
        let mut previous = fixture();
        previous.cycles[0].name = "Before restore".into();
        restored
            .restore_detached(previous, 0, |_| Ok(previous_pdf.to_vec()))
            .unwrap();
        zip.restore(&mut restored, 1).unwrap();
        drop(restored);

        let mut restored = Store::open(&database).unwrap();
        assert_eq!(restored.backup().unwrap(), source.backup().unwrap());
        let previous = restored.recover(2).unwrap();
        assert_eq!(previous.workspace.cycles[0].name, "Before restore");
        assert_eq!(
            restored.attachment_bytes(&[ID.into()]).unwrap()[0].bytes,
            previous_pdf
        );
        restored.recover(3).unwrap();
        assert_eq!(restored.backup().unwrap(), source.backup().unwrap());
    }

    #[test]
    fn rejects_bad_archives_and_never_replaces_live_data_on_failed_restore() {
        let folder = tempfile::tempdir().unwrap();
        let path = folder.path().join("training.ankerzug.zip");
        let mut store = Store::open(Path::new(":memory:")).unwrap();
        store.restore(LEGACY, 0).unwrap();
        for (version, name, pdf) in [
            (3, None, PDF),
            (3, Some("../unexpected.pdf".to_owned()), PDF),
            (4, Some(entry_name(ID)), PDF),
            (3, Some(entry_name(ID)), b"not a PDF"),
        ] {
            let mut writer = ZipWriter::new(File::create(&path).unwrap());
            let options = SimpleFileOptions::default();
            writer.start_file(MANIFEST, options).unwrap();
            serde_json::to_writer(
                &mut writer,
                &Backup {
                    format_version: version,
                    workspace: fixture(),
                },
            )
            .unwrap();
            if let Some(name) = name {
                writer.start_file(name, options).unwrap();
                writer.write_all(pdf).unwrap();
            }
            writer.finish().unwrap();
            if pdf == PDF {
                assert!(open_backup(&path).is_err());
            } else {
                let mut zip = prepared(&path);
                assert!(zip.stage_pdf(ID).is_err());
                assert!(zip.restore(&mut store, 1).is_err());
            }
        }
        write_zip(&path, fixture(), |_| Ok(PDF.to_vec())).unwrap();
        let mut zip = prepared(&path);
        zip.stage_pdf(ID).unwrap();
        assert!(zip.restore(&mut store, 0).is_err());
        assert_eq!(store.load().unwrap().revision, 1);
        assert!(store.recover(1).is_err());
        assert!(write_zip(&path, fixture(), |_| Err(invalid("Test write failure"))).is_err());
        assert_eq!(prepared(&path).stage_pdf(ID).unwrap(), PDF);
    }

    #[test]
    fn detects_pdf_crc_errors_even_when_the_pdf_still_has_valid_markers() {
        let folder = tempfile::tempdir().unwrap();
        let path = folder.path().join("corrupt.ankerzug.zip");
        let mut writer = ZipWriter::new(File::create(&path).unwrap());
        let options = SimpleFileOptions::default().compression_method(CompressionMethod::Stored);
        writer.start_file(MANIFEST, options).unwrap();
        serde_json::to_writer(
            &mut writer,
            &Backup {
                format_version: 3,
                workspace: fixture(),
            },
        )
        .unwrap();
        writer.start_file(entry_name(ID), options).unwrap();
        writer.write_all(b"%PDF-1.7\nbody\n%%EOF").unwrap();
        writer.finish().unwrap();
        let mut bytes = std::fs::read(&path).unwrap();
        let body = bytes
            .windows(4)
            .position(|window| window == b"body")
            .unwrap();
        bytes[body] = b'B';
        std::fs::write(&path, bytes).unwrap();
        let mut zip = prepared(&path);
        assert!(zip.stage_pdf(ID).is_err());
    }

    #[test]
    fn restores_more_than_200_mib_of_pdfs_with_a_small_manifest() {
        let folder = tempfile::tempdir().unwrap();
        let path = folder.path().join("large.ankerzug.zip");
        let mut workspace = fixture();
        let document = include_str!("../../fixtures/games-package-v1.json");
        let games = crate::games::parse_package(document).unwrap().games;
        workspace.games = games;
        workspace.games[0].attachments = (0..41)
            .map(|i| GameAttachment {
                id: format!("large-pdf-{i}"),
                filename: format!("{i}.pdf"),
                bytes: None,
            })
            .collect();
        let mut large_pdf = vec![b' '; ATTACHMENT_LIMIT];
        large_pdf[..8].copy_from_slice(b"%PDF-1.7");
        large_pdf[ATTACHMENT_LIMIT - 5..].copy_from_slice(b"%%EOF");
        write_zip(&path, workspace, |id| {
            Ok(if id == ID {
                PDF.to_vec()
            } else {
                large_pdf.clone()
            })
        })
        .unwrap();
        let mut zip = prepared(&path);
        let ids: Vec<_> = zip.pdfs.iter().map(|pdf| pdf.id.clone()).collect();
        for id in &ids {
            zip.stage_pdf(id).unwrap();
        }
        assert!(zip.staged_size > JSON_LIMIT);
        let db = folder.path().join("large.sqlite3");
        let mut store = Store::open(&db).unwrap();
        zip.restore(&mut store, 0).unwrap();
        drop(store);
        let store = Store::open(&db).unwrap();
        assert_eq!(
            store.load().unwrap().workspace.games[0].attachments.len(),
            41
        );
        assert_eq!(
            store.attachment_bytes(&["large-pdf-40".into()]).unwrap()[0].bytes,
            large_pdf
        );
    }

    #[test]
    fn opens_legacy_files_independently_of_their_historic_names() {
        let folder = tempfile::tempdir().unwrap();
        let mut store = Store::open(Path::new(":memory:")).unwrap();
        for (revision, name, contents) in [
            (
                0,
                "ankerzug-1.json",
                include_str!("../../fixtures/workspace-v1.json"),
            ),
            (1, "last.ankerzug.json", LEGACY),
        ] {
            let path = folder.path().join(name);
            std::fs::write(&path, contents).unwrap();
            let SelectedBackup::Legacy(json) = open_backup(&path).unwrap() else {
                panic!("Expected JSON")
            };
            assert_eq!(
                store.restore(&json, revision).unwrap().revision,
                revision + 1
            );
        }
    }
}
