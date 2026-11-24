"""Verify Tauri bundles before upload and require the full release asset set."""

import argparse
import os
import plistlib
import shutil
import subprocess
from pathlib import Path
from tempfile import TemporaryDirectory

BINARY = "ankerzug"
PACKAGE_EXTENSIONS = {".deb", ".rpm", ".msi", ".exe", ".dmg"}


def expected_packages(version):
    return {
        "x86_64-unknown-linux-gnu": (
            Path(f"deb/Ankerzug_{version}_amd64.deb"),
            Path(f"rpm/Ankerzug-{version}-1.x86_64.rpm"),
        ),
        "aarch64-unknown-linux-gnu": (
            Path(f"deb/Ankerzug_{version}_arm64.deb"),
            Path(f"rpm/Ankerzug-{version}-1.aarch64.rpm"),
        ),
        "x86_64-pc-windows-msvc": (Path(f"msi/Ankerzug_{version}_x64_en-US.msi"),),
        "aarch64-pc-windows-msvc": (Path(f"nsis/Ankerzug_{version}_arm64-setup.exe"),),
        "universal-apple-darwin": (Path(f"dmg/Ankerzug_{version}_universal.dmg"),),
    }


def require_files(directory, expected, actual):
    missing = expected - actual
    unexpected = actual - expected
    if missing or unexpected:
        mismatch = [str(directory)]
        if missing:
            mismatch.append("Missing: " + ", ".join(map(str, sorted(missing))))
        if unexpected:
            mismatch.append("Unexpected or duplicate: " + ", ".join(map(str, sorted(unexpected))))
        raise SystemExit("\n".join(mismatch))


def run(*args, **kwargs):
    subprocess.run(args, check=True, **kwargs)


def output(*args):
    return subprocess.check_output(args, text=True).strip()


def verify_linux(package, work, target):
    arm64 = target.startswith("aarch64-")
    if package.suffix == ".deb":
        expected_arch = "arm64" if arm64 else "amd64"
        arch = output("dpkg-deb", "--field", package, "Architecture")
        run("dpkg-deb", "--extract", package, work)
    else:
        expected_arch = "aarch64" if arm64 else "x86_64"
        arch = output("rpm", "-qp", "--queryformat", "%{ARCH}", package)
        with (work / "payload.cpio").open("w+b") as archive:
            run("rpm2cpio", package, stdout=archive)
            archive.seek(0)
            run("cpio", "--extract", "--make-directories", "--quiet", stdin=archive, cwd=work)
    if arch != expected_arch:
        raise SystemExit(f"{package.name}: expected package architecture {expected_arch}, got {arch}.")

    # ELF64, little endian, with e_machine set to AArch64 (183) or x86-64 (62).
    with (work / "usr/bin" / BINARY).open("rb") as binary:
        header = binary.read(20)
    machine = int.from_bytes(header[18:20], "little")
    if not header.startswith(b"\x7fELF\x02\x01") or machine != (183 if arm64 else 62):
        raise SystemExit(f"{package.name}: expected a native {expected_arch} ELF64 executable.")


def verify_nsis(package, work):
    # NSIS uses an x86 bootstrapper. Inspect its installed application payload.
    seven_zip = shutil.which("7z") or Path(os.environ["ProgramFiles"]) / "7-Zip/7z.exe"
    run(seven_zip, "x", package, f"-o{work}", f"-ir!{BINARY}.exe", "-y")
    binaries = list(work.rglob(f"{BINARY}.exe"))
    if len(binaries) != 1:
        raise SystemExit(f"{package.name}: expected one {BINARY}.exe in the NSIS payload.")
    with binaries[0].open("rb") as binary:
        dos_header = binary.read(64)
        if len(dos_header) != 64 or not dos_header.startswith(b"MZ"):
            raise SystemExit(f"{package.name}: invalid application executable header.")
        binary.seek(int.from_bytes(dos_header[60:64], "little"))
        # PE signature followed by IMAGE_FILE_MACHINE_ARM64 (0xAA64).
        if binary.read(6) != b"PE\0\0\x64\xaa":
            raise SystemExit(f"{package.name}: expected a native ARM64 application executable.")


def verify_dmg(package, work):
    run("hdiutil", "attach", "-readonly", "-nobrowse", "-mountpoint", work, package)
    try:
        contents = work / "Ankerzug.app/Contents"
        with (contents / "Info.plist").open("rb") as plist:
            executable = plistlib.load(plist)["CFBundleExecutable"]
        archs = output("lipo", "-archs", contents / "MacOS" / executable)
        if set(archs.split()) != {"x86_64", "arm64"}:
            raise SystemExit(f"{package.name}: expected x86_64 and arm64 slices, got {archs}.")
    finally:
        run("hdiutil", "detach", work)


def stage_packages(packages, target):
    bundle = Path("src-tauri/target") / target / "release/bundle"
    paths = packages[target]
    actual = {
        path.relative_to(bundle)
        for path in bundle.glob("*/*")
        if path.is_file() and path.suffix.lower() in PACKAGE_EXTENSIONS
    }
    require_files(bundle, set(paths), actual)

    stage = Path("desktop-packages")
    stage.mkdir()
    for path in paths:
        package = (bundle / path).resolve()
        with TemporaryDirectory() as temp:
            work = Path(temp)
            if path.suffix in {".deb", ".rpm"}:
                verify_linux(package, work, target)
            elif path.suffix == ".exe":
                verify_nsis(package, work)
            elif path.suffix == ".dmg":
                verify_dmg(package, work)
        shutil.copyfile(package, stage / path.name)
        print(f"Verified {package.name}")


def list_release_assets(packages):
    root = Path("release-assets")
    expected = {
        Path(f"ankerzug-{target}") / path.name
        for target, paths in packages.items()
        for path in paths
    }
    actual = {path.relative_to(root) for path in root.rglob("*") if path.is_file()}
    require_files(root, expected, actual)
    for path in sorted(expected):
        print(root / path)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("operation", choices=("stage", "release"))
    parser.add_argument("version")
    parser.add_argument("target", nargs="?")
    args = parser.parse_args()
    packages = expected_packages(args.version)
    if args.operation == "stage":
        if args.target not in packages:
            parser.error("stage requires a supported package target")
        stage_packages(packages, args.target)
    else:
        list_release_assets(packages)
